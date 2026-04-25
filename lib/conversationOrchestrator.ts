"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AzureSTTClient, AzureTTSClient } from "@/lib/azure";
import {
  BrowserSTTClient,
  BrowserTTSClient,
  browserSupportsSTT,
  browserSupportsTTS,
} from "@/lib/fallback";
import { groqClient, SentenceStreamer } from "@/lib/groq";
import { TurnTimer } from "@/lib/latency";
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

const MAX_HISTORY_TURNS = 8; // Keep last N exchanges to bound prompt size.

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

  // Keep personality ref synced; voice updates apply to the active TTS client.
  useEffect(() => {
    personalityRef.current = personality;
    if (azureTtsRef.current) azureTtsRef.current.setVoice(personality.voice);
  }, [personality]);

  /* ----------------- helpers ----------------- */

  const setStatusSafe = useCallback((s: RizzyStatus) => {
    setStatus(s);
  }, []);

  const ensureClients = useCallback(async () => {
    // Pick STT
    if (!sttRef.current) {
      try {
        // Probe Azure token first; if it fails, fall back immediately.
        const probe = await fetch("/api/azure/token", { method: "GET" });
        if (probe.ok) {
          sttRef.current = new AzureSTTClient();
        } else if (browserSupportsSTT()) {
          sttRef.current = new BrowserSTTClient();
        } else {
          throw new Error(
            "No working speech recognizer (Azure unavailable, browser not supported).",
          );
        }
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

      const enqueueSentence = (sentence: string) => {
        const tts = ttsRef.current;
        if (!tts) return;
        if (timer.finalize().ttsRequestedAt === undefined) {
          timer.mark("ttsRequestedAt");
        }
        ttsQueueTail = ttsQueueTail.then(() =>
          tts.speak(sentence, {
            onFirstAudio: () => {
              timer.mark("firstAudioAt");
              setStatusSafe("speaking");
            },
            onError: (err) => {
              // Azure TTS error → swap to browser TTS for the remainder.
              if (!fallbackRef.current && tts === azureTtsRef.current) {
                fallbackRef.current = true;
                ttsRef.current = new BrowserTTSClient();
                ttsRef.current.speak(sentence, {
                  onFirstAudio: () => {
                    timer.mark("firstAudioAt");
                    setStatusSafe("speaking");
                  },
                });
              } else {
                console.warn("TTS error (suppressed):", err);
              }
            },
          }),
        );
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
            signal: abort.signal,
          },
        );

        // Wait for the TTS queue to drain.
        await ttsQueueTail;
        timer.mark("audioCompletedAt");
        const finalized = timer.finalize();
        onLatency?.(finalized);

        // Resume listening for next user turn (if user still wants active).
        if (wantsActiveRef.current && !fallbackRef.current) {
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

  /* ----------------- listening control ----------------- */

  const startListeningInternal = useCallback(async () => {
    const stt = sttRef.current;
    if (!stt) return;
    setStatusSafe("listening");

    const timer = new TurnTimer();
    turnTimerRef.current = timer;

    await stt.start({
      onSpeechStart: () => timer.mark("speechStartedAt"),
      onSpeechEnd: () => timer.mark("speechEndedAt"),
      onPartial: (text) => setPartialUserText(text),
      onFinal: async (text) => {
        timer.mark("transcriptReceivedAt");
        if (!timer.finalize().speechEndedAt) {
          // Some recognizers don't emit speechEndDetected — backfill.
          timer.mark("speechEndedAt");
        }
        // Pause mic while Rizzy thinks + speaks (turn-taking).
        await stt.stop();
        await runTurn(text, timer);
      },
      onError: (err) => {
        setError(err.message);
        setStatusSafe("error_retry");
      },
    });
  }, [runTurn, setStatusSafe]);

  /* ----------------- public API ----------------- */

  const start = useCallback(async () => {
    setError(null);
    wantsActiveRef.current = true;
    fallbackRef.current = false;
    try {
      await ensureClients();
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
  }, [ensureClients, startListeningInternal, setStatusSafe]);

  const stop = useCallback(async () => {
    wantsActiveRef.current = false;
    inFlightAbortRef.current?.abort();
    inFlightAbortRef.current = null;
    try {
      await sttRef.current?.stop();
      await ttsRef.current?.cancel();
    } catch {
      /* swallow */
    }
    setStatusSafe("idle");
    setPartialUserText("");
  }, [setStatusSafe]);

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
    sttRef.current?.stop().catch(() => {});
    setStatusSafe("fallback_text");
  }, [setStatusSafe]);

  /* ----------------- lifecycle cleanup ----------------- */

  useEffect(() => {
    return () => {
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
