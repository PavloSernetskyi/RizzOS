"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AzureSTTClient, AzureTTSClient, preloadAzureToken } from "@/lib/azure";
import {
  BrowserSTTClient,
  BrowserTTSClient,
  browserSupportsSTT,
  browserSupportsTTS,
} from "@/lib/fallback";
import { groqClient, SentenceStreamer } from "@/lib/groq";
import { playGreetingAudio, stopGreetingAudio } from "@/lib/greetingAudio";
import { TurnTimer } from "@/lib/latency";
import {
  parseLeadingCue,
  stripAllCues,
  type ExpressionOverride,
} from "@/lib/expression";
import type { Message, RizzyStatus } from "@/types/conversation";
import type { LatencyTurn } from "@/types/latency";
import type { Personality } from "@/types/personality";
import type {
  LLMMessage,
  STTClient,
  TTSClient,
} from "@/types/provider";

/**
 * The orchestrator is the conversational brain. It owns:
 *   - the state machine (idle → listening → processing → speaking → ...)
 *   - the STT client (Azure preferred, browser fallback)
 *   - the LLM client (Groq via /api/groq/chat)
 *   - the TTS client (Azure preferred, browser fallback)
 *   - per-turn latency timing
 *   - graceful fallback on provider failures
 *
 * UI components only consume the returned hook — they never touch
 * Azure / Groq / browser APIs directly.
 */

export interface UseRizzyConversationOptions {
  personality: Personality;
  onMessage: (msg: Message) => void;
  onMessageUpdate?: (id: string, text: string, pending: boolean) => void;
  onLatency?: (turn: LatencyTurn) => void;
}

export interface UseRizzyConversationReturn {
  status: RizzyStatus;
  isActive: boolean;
  partialUserText: string;
  error: string | null;
  start: () => Promise<void>;
  stop: () => Promise<void>;
  sendText: (text: string) => Promise<void>;
  switchToTextFallback: () => void;
}

// Bigger window = better callbacks ("the caramel from earlier"). Llama 3.3
// has 128k context so this is nowhere near a hard limit; we just keep prompts
// snappy. 8 turns ≈ 16 messages — enough for memory callbacks within a few
// minutes of conversation, small enough that prompt processing stays fast.
// (Was 12 in 2.2 — dropped to 8 in 2.3 for tighter time-to-first-token.)
const MAX_HISTORY_TURNS = 8;

// Auto-end the session if the user is silent for this long while in the
// "listening" state. Protects against the "tab left open" billing trap.
// Reset on any voice activity (speech start, partial transcripts).
const IDLE_TIMEOUT_MS = 60_000;

function uid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function useRizzyConversation(
  opts: UseRizzyConversationOptions,
): UseRizzyConversationReturn {
  const { personality, onMessage, onMessageUpdate, onLatency } = opts;

  const [status, setStatus] = useState<RizzyStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [partialUserText, setPartialUserText] = useState<string>("");

  // Refs hold mutable conversational machinery so React renders don't
  // accidentally tear them down mid-turn.
  const sttRef = useRef<STTClient | null>(null);
  const ttsRef = useRef<TTSClient | null>(null);
  const azureTtsRef = useRef<AzureTTSClient | null>(null);
  const historyRef = useRef<LLMMessage[]>([]);
  const personalityRef = useRef<Personality>(personality);
  const turnTimerRef = useRef<TurnTimer | null>(null);
  const inFlightAbortRef = useRef<AbortController | null>(null);
  const wantsActiveRef = useRef<boolean>(false);
  const fallbackRef = useRef<boolean>(false);
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handlingFinalRef = useRef<boolean>(false);

  // Keep personality ref synced; voice updates apply to the active TTS client.
  useEffect(() => {
    personalityRef.current = personality;
    if (azureTtsRef.current) azureTtsRef.current.setVoice(personality.voice);
  }, [personality]);

  /* ----------------- helpers ----------------- */

  const setStatusSafe = useCallback((s: RizzyStatus) => {
    setStatus(s);
  }, []);

  // Idle watchdog: if the user opens a session, taps "Talk to Rizzy", and
  // then walks away, we don't want the mic + Azure billing meter to keep
  // ticking forever. We arm a timer whenever we enter "listening" and
  // reset it on any voice activity (speech start, partial transcripts).
  const clearIdleTimer = useCallback(() => {
    if (idleTimerRef.current) {
      clearTimeout(idleTimerRef.current);
      idleTimerRef.current = null;
    }
  }, []);

  const armIdleTimer = useCallback(() => {
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    idleTimerRef.current = setTimeout(() => {
      idleTimerRef.current = null;
      // Mirror what stop() does, but with a friendly nudge so the user
      // knows the session ended on purpose, not because of a bug.
      wantsActiveRef.current = false;
      inFlightAbortRef.current?.abort();
      inFlightAbortRef.current = null;
      sttRef.current?.stop().catch(() => {});
      ttsRef.current?.cancel().catch(() => {});
      handlingFinalRef.current = false;
      setPartialUserText("");
      setStatusSafe("idle");
      setError(
        "Session ended — no activity for a minute. Tap Talk to Rizzy to keep going.",
      );
    }, IDLE_TIMEOUT_MS);
  }, [setStatusSafe]);

  // Mobile browsers (especially iOS Safari) require getUserMedia() to be
  // called *synchronously* inside a user gesture, BEFORE any awaits. Our
  // Azure SDK eventually calls getUserMedia internally, but only AFTER we
  // fetch a token + speak the greeting — by then the user gesture has
  // expired and iOS silently denies the prompt.
  //
  // Fix: as the very first thing inside the click handler we ask for mic
  // permission ourselves, then immediately release the tracks. Once the
  // browser has granted access for this page session, Azure can re-acquire
  // the mic later without re-prompting.
  //
  // IMPORTANT: this MUST be the first awaited call in start() — anything
  // before it (synchronous or not) is fine, but no async work in between.
  const preflightMic = useCallback(async () => {
    if (
      typeof navigator === "undefined" ||
      !navigator.mediaDevices?.getUserMedia
    ) {
      // No mediaDevices API — old browser. Let downstream STT handle it
      // (Azure SDK will throw a clearer error, browser fallback won't work).
      return;
    }
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    // We just needed the prompt to fire; release the tracks immediately so
    // Azure's recognizer gets a clean handle later.
    stream.getTracks().forEach((t) => t.stop());
  }, []);

  const ensureClients = useCallback(async () => {
    // Pick STT
    if (!sttRef.current) {
      try {
        // Warm the shared Azure token cache. First TTS/STT use reuses it
        // instead of doing a second token request after this probe.
        await preloadAzureToken();
        sttRef.current = new AzureSTTClient();
      } catch (err) {
        if (browserSupportsSTT()) {
          sttRef.current = new BrowserSTTClient();
        } else {
          throw err;
        }
      }
    }

    // Pick TTS
    if (!ttsRef.current) {
      const azure = new AzureTTSClient(personalityRef.current.voice);
      azureTtsRef.current = azure;
      ttsRef.current = azure;
      azure.warmUp().catch(() => {});
      // We let the first speak() determine if Azure works — if it errors,
      // we'll swap to browser fallback.
    }
  }, []);

  /* ----------------- main turn pipeline ----------------- */

  const runTurn = useCallback(
    async (userText: string, timer: TurnTimer) => {
      // Push user message to UI immediately.
      const userMsg: Message = {
        id: uid(),
        speaker: "user",
        text: userText,
        createdAt: Date.now(),
      };
      onMessage(userMsg);
      setPartialUserText("");

      // Prepare history → LLM messages
      const personalityNow = personalityRef.current;
      const sysMsg: LLMMessage = {
        role: "system",
        content: personalityNow.systemPrompt,
      };
      // Trim history to last N turns
      const trimmed = historyRef.current.slice(-MAX_HISTORY_TURNS * 2);
      const llmMessages: LLMMessage[] = [
        sysMsg,
        ...trimmed,
        { role: "user", content: userText },
      ];

      // Start streaming response into UI + queue sentences for TTS.
      const rizzyMsgId = uid();
      let rizzySoFar = "";
      const streamer = new SentenceStreamer();
      let ttsQueueTail: Promise<void> = Promise.resolve();

      setStatusSafe("processing");
      timer.mark("llmRequestStartedAt");

      const abort = new AbortController();
      inFlightAbortRef.current = abort;

      // Active emotion cue carries across sentences within a single turn —
      // so "[warm] Hey there. How's your day?" speaks BOTH sentences warm
      // even though only the first carries the explicit cue.
      let activeExpression: ExpressionOverride | undefined;

      const enqueueSentence = (rawSentence: string) => {
        if (!ttsRef.current) return;
        if (timer.finalize().ttsRequestedAt === undefined) {
          timer.mark("ttsRequestedAt");
        }

        // Strip a leading "[cue]" off the spoken text, but only for TTS —
        // the transcript still shows it so the user reads Rizzy's mood.
        // stripAllCues handles any inline cues the model snuck in
        // mid-sentence so Azure doesn't read them literally.
        const parsed = parseLeadingCue(rawSentence);
        if (parsed.expression) activeExpression = parsed.expression;
        const spoken = stripAllCues(parsed.cleanText);
        if (!spoken) return;

        const expression = activeExpression;

        ttsQueueTail = ttsQueueTail.then(async () => {
          const tts = ttsRef.current;
          if (!tts) return;

          let fallbackSpeech: Promise<void> | null = null;

          await tts.speak(spoken, {
            expression,
            onFirstAudio: () => {
              timer.mark("firstAudioAt");
              setStatusSafe("speaking");
            },
            onError: (err) => {
              // Azure TTS error → swap to browser TTS for the remainder.
              if (!fallbackRef.current && tts === azureTtsRef.current) {
                fallbackRef.current = true;
                ttsRef.current = new BrowserTTSClient();
                fallbackSpeech = ttsRef.current.speak(spoken, {
                  onFirstAudio: () => {
                    timer.mark("firstAudioAt");
                    setStatusSafe("speaking");
                  },
                });
              } else {
                console.warn("TTS error (suppressed):", err);
              }
            },
          });

          await fallbackSpeech;
        });
      };

      try {
        await groqClient.stream(
          llmMessages,
          {
            onFirstToken: () => {
              timer.mark("llmFirstTokenAt");
            },
            onChunk: (chunk) => {
              rizzySoFar += chunk;
              const { sentences } = streamer.push(chunk);
              for (const s of sentences) enqueueSentence(s);
              // Live-update transcript so the user sees Rizzy "type"
              onMessageUpdate?.(rizzyMsgId, rizzySoFar, true);
              // Push the message stub on the very first chunk
              if (rizzySoFar.length === chunk.length) {
                onMessage({
                  id: rizzyMsgId,
                  speaker: "rizzy",
                  text: rizzySoFar,
                  createdAt: Date.now(),
                  pending: true,
                });
              }
            },
            onComplete: (full) => {
              timer.mark("llmCompletedAt");
              const tail = streamer.flush();
              if (tail) enqueueSentence(tail);
              rizzySoFar = full || rizzySoFar;
              onMessageUpdate?.(rizzyMsgId, rizzySoFar, false);
              historyRef.current.push(
                { role: "user", content: userText },
                { role: "assistant", content: rizzySoFar },
              );
            },
            onError: (err) => {
              setError(err.message);
              setStatusSafe("error_retry");
            },
          },
          {
            temperature: personalityNow.response.temperature,
            maxTokens: personalityNow.response.maxTokens,
            frequencyPenalty: personalityNow.response.frequencyPenalty,
            presencePenalty: personalityNow.response.presencePenalty,
            signal: abort.signal,
          },
        );

        // Wait for the TTS queue to drain.
        await ttsQueueTail;
        timer.mark("audioCompletedAt");
        const finalized = timer.finalize();
        onLatency?.(finalized);

        // Resume listening for next user turn (if user still wants active).
        if (wantsActiveRef.current) {
          await startListeningInternal();
        } else if (!wantsActiveRef.current) {
          setStatusSafe("idle");
        }
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Turn failed.";
        setError(message);
        setStatusSafe("error_retry");
      }
    },
    [onMessage, onMessageUpdate, onLatency, setStatusSafe],
  );

  /* ----------------- greeting (Rizzy speaks first) ----------------- */

  /**
   * On `start()`, before opening the mic, Rizzy says a short personality-
   * specific opener. Static audio plays first when available; Azure TTS
   * remains the fallback so the app still works if assets are missing.
   */
  const speakGreetingInternal = useCallback(async (
    prepareTts?: () => Promise<void>,
  ) => {
    const personalityNow = personalityRef.current;
    const lines = personalityNow.idleLines;
    if (!lines.length) return;

    const greetingIndex = Math.floor(Math.random() * lines.length);
    const greeting = lines[greetingIndex];
    const id = uid();

    // Authored idleLines may carry a leading "[cue]" — strip for TTS,
    // keep for transcript so the user reads Rizzy's vibe in the UI.
    const parsed = parseLeadingCue(greeting);
    const spoken = stripAllCues(parsed.cleanText) || greeting;

    onMessage({
      id,
      speaker: "rizzy",
      text: greeting,
      createdAt: Date.now(),
    });

    setStatusSafe("speaking");

    if (await playGreetingAudio(personalityNow, greetingIndex)) return;

    await prepareTts?.();
    const tts = ttsRef.current;
    if (!tts) return;

    await new Promise<void>((resolve) => {
      tts.speak(spoken, {
        expression: parsed.expression,
        onComplete: () => resolve(),
        onError: (err) => {
          // Greeting is best-effort. If Azure TTS fails here, swap to
          // browser TTS for the rest of the session and keep going.
          if (!fallbackRef.current && tts === azureTtsRef.current) {
            fallbackRef.current = true;
            ttsRef.current = new BrowserTTSClient();
            ttsRef.current
              .speak(spoken, { onComplete: () => resolve() })
              .catch(() => resolve());
          } else {
            console.warn("Greeting TTS error (suppressed):", err);
            resolve();
          }
        },
      });
    });
  }, [onMessage, setStatusSafe]);

  /* ----------------- listening control ----------------- */

  const startListeningInternal = useCallback(async () => {
    const stt = sttRef.current;
    if (!stt) return;
    handlingFinalRef.current = false;
    setStatusSafe("listening");

    const timer = new TurnTimer();
    turnTimerRef.current = timer;

    // Start the idle watchdog. Any voice activity below resets it.
    armIdleTimer();

    await stt.start({
      onSpeechStart: () => {
        timer.mark("speechStartedAt");
        armIdleTimer();
      },
      onSpeechEnd: () => timer.mark("speechEndedAt"),
      onPartial: (text) => {
        setPartialUserText(text);
        armIdleTimer();
      },
      onFinal: async (text) => {
        if (handlingFinalRef.current) return;
        handlingFinalRef.current = true;
        clearIdleTimer();
        timer.mark("transcriptReceivedAt");
        if (!timer.finalize().speechEndedAt) {
          // Some recognizers don't emit speechEndDetected — backfill.
          timer.mark("speechEndedAt");
        }
        // Pause mic while Rizzy thinks + speaks (turn-taking).
        try {
          await stt.stop();
          await runTurn(text, timer);
        } finally {
          handlingFinalRef.current = false;
        }
      },
      onError: (err) => {
        clearIdleTimer();
        setError(err.message);
        setStatusSafe("error_retry");
      },
    });
  }, [runTurn, setStatusSafe, armIdleTimer, clearIdleTimer]);

  /* ----------------- public API ----------------- */

  const start = useCallback(async () => {
    setError(null);
    wantsActiveRef.current = true;
    fallbackRef.current = false;

    // Step 1: request mic permission FIRST, while the user gesture is still
    // alive. Mobile browsers (esp. iOS Safari) won't show the prompt if we
    // call getUserMedia later in the chain (after token fetch + greeting).
    try {
      await preflightMic();
    } catch (err) {
      const denied =
        err instanceof Error &&
        (err.name === "NotAllowedError" ||
          err.name === "PermissionDeniedError" ||
          /denied|permission/i.test(err.message));
      if (denied) {
        setError(
          "Microphone permission was denied. To talk to Rizzy, allow mic access in your browser settings and tap Talk to Rizzy again. (You can also use the text input below.)",
        );
      } else {
        setError(
          "Couldn't access your microphone. Make sure no other app is using it, then try again.",
        );
      }
      setStatusSafe("error_retry");
      wantsActiveRef.current = false;
      return;
    }

    try {
      const clientsReady = ensureClients();
      clientsReady.catch(() => {});
      // Rizzy greets first, then opens the mic. If the user taps End mid-
      // greeting we honor that and don't fall through to listening.
      await speakGreetingInternal(() => clientsReady);
      await clientsReady;
      azureTtsRef.current?.warmUp().catch(() => {});
      if (!wantsActiveRef.current) {
        setStatusSafe("idle");
        return;
      }
      await startListeningInternal();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Couldn't start.";
      setError(message);
      // If STT unavailable, drop into text fallback so the user can still chat.
      if (!browserSupportsSTT()) {
        setStatusSafe("fallback_text");
      } else {
        setStatusSafe("error_retry");
      }
    }
  }, [
    preflightMic,
    ensureClients,
    speakGreetingInternal,
    startListeningInternal,
    setStatusSafe,
  ]);

  const stop = useCallback(async () => {
    wantsActiveRef.current = false;
    handlingFinalRef.current = false;
    clearIdleTimer();
    inFlightAbortRef.current?.abort();
    inFlightAbortRef.current = null;
    try {
      stopGreetingAudio();
      await sttRef.current?.stop();
      await ttsRef.current?.cancel();
    } catch {
      /* swallow */
    }
    setStatusSafe("idle");
    setPartialUserText("");
  }, [setStatusSafe, clearIdleTimer]);

  const sendText = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed) return;
      setError(null);
      try {
        await ensureClients();
      } catch {
        /* still try; runTurn doesn't strictly need TTS */
      }
      const timer = new TurnTimer();
      timer.mark("speechEndedAt");
      timer.mark("transcriptReceivedAt");
      await runTurn(trimmed, timer);
    },
    [ensureClients, runTurn],
  );

  const switchToTextFallback = useCallback(() => {
    wantsActiveRef.current = false;
    handlingFinalRef.current = false;
    clearIdleTimer();
    sttRef.current?.stop().catch(() => {});
    setStatusSafe("fallback_text");
  }, [setStatusSafe, clearIdleTimer]);

  /* ----------------- lifecycle cleanup ----------------- */

  useEffect(() => {
    return () => {
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
      idleTimerRef.current = null;
      stopGreetingAudio();
      sttRef.current?.dispose().catch(() => {});
      ttsRef.current?.dispose().catch(() => {});
      inFlightAbortRef.current?.abort();
    };
  }, []);

  const isActive = useMemo(
    () =>
      status === "listening" ||
      status === "processing" ||
      status === "speaking",
    [status],
  );

  return {
    status,
    isActive,
    partialUserText,
    error,
    start,
    stop,
    sendText,
    switchToTextFallback,
  };
}
