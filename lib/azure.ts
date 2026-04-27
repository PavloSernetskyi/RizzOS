"use client";

import * as Speech from "microsoft-cognitiveservices-speech-sdk";
import type {
  STTClient,
  STTHandlers,
  TTSClient,
  TTSSpeakOptions,
} from "@/types/provider";
import type { VoiceTuning } from "@/types/personality";
import type { ExpressionOverride } from "@/lib/expression";

interface AzureToken {
  token: string;
  region: string;
  fetchedAt: number;
}

let cached: AzureToken | null = null;
let inflight: Promise<AzureToken> | null = null;

const TOKEN_TTL_MS = 8 * 60 * 1000; // Azure tokens last 10 min — refresh at 8.

async function fetchAzureToken(): Promise<AzureToken> {
  const now = Date.now();
  if (cached && now - cached.fetchedAt < TOKEN_TTL_MS) return cached;
  if (inflight) return inflight;

  inflight = (async () => {
    const res = await fetch("/api/azure/token", { method: "GET" });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Azure token error (${res.status}): ${text}`);
    }
    const data = (await res.json()) as { token: string; region: string };
    cached = { token: data.token, region: data.region, fetchedAt: Date.now() };
    return cached;
  })();

  try {
    return await inflight;
  } finally {
    inflight = null;
  }
}

export async function preloadAzureToken(): Promise<void> {
  await fetchAzureToken();
}

async function buildSpeechConfig(): Promise<Speech.SpeechConfig> {
  const { token, region } = await fetchAzureToken();
  const config = Speech.SpeechConfig.fromAuthorizationToken(token, region);
  config.speechRecognitionLanguage = "en-US";
  return config;
}

/* ------------------------------------------------------------------ */
/*                          STT  (mic → text)                          */
/* ------------------------------------------------------------------ */

export class AzureSTTClient implements STTClient {
  private recognizer: Speech.SpeechRecognizer | null = null;
  private listening = false;

  isListening(): boolean {
    return this.listening;
  }

  async start(handlers: STTHandlers): Promise<void> {
    if (this.listening) return;

    const config = await buildSpeechConfig();
    const audio = Speech.AudioConfig.fromDefaultMicrophoneInput();
    const recognizer = new Speech.SpeechRecognizer(config, audio);
    this.recognizer = recognizer;

    recognizer.recognizing = (_s, e) => {
      if (e.result.text) handlers.onPartial?.(e.result.text);
    };

    recognizer.recognized = (_s, e) => {
      if (e.result.reason === Speech.ResultReason.RecognizedSpeech) {
        const text = e.result.text?.trim();
        if (text) handlers.onFinal(text);
      }
    };

    recognizer.canceled = (_s, e) => {
      this.listening = false;
      if (e.reason === Speech.CancellationReason.Error) {
        handlers.onError(
          new Error(`Azure STT canceled: ${e.errorDetails ?? "unknown"}`),
        );
      }
    };

    recognizer.sessionStarted = () => {
      handlers.onSpeechStart?.();
    };

    recognizer.speechEndDetected = () => {
      handlers.onSpeechEnd?.();
    };

    await new Promise<void>((resolve, reject) => {
      recognizer.startContinuousRecognitionAsync(
        () => {
          this.listening = true;
          resolve();
        },
        (err) => reject(new Error(err)),
      );
    });
  }

  async stop(): Promise<void> {
    const r = this.recognizer;
    if (!r || !this.listening) {
      this.listening = false;
      return;
    }
    await new Promise<void>((resolve) => {
      r.stopContinuousRecognitionAsync(
        () => {
          this.listening = false;
          resolve();
        },
        () => {
          this.listening = false;
          resolve();
        },
      );
    });
  }

  async dispose(): Promise<void> {
    await this.stop();
    try {
      this.recognizer?.close();
    } catch {
      /* swallow */
    }
    this.recognizer = null;
  }
}

/* ------------------------------------------------------------------ */
/*                          TTS  (text → speech)                       */
/* ------------------------------------------------------------------ */

/**
 * Sentence-by-sentence Azure TTS with a serialized queue. The orchestrator
 * pushes sentences as the LLM streams them; this client speaks them in
 * order, fires `onFirstAudio` the moment the first sentence starts.
 *
 * IMPORTANT — promise resolution timing:
 *   `speakSsmlAsync`'s callback fires when SYNTHESIS completes, which is
 *   before audio actually finishes playing through the speakers. If we
 *   resolved on that callback, the next sentence would start synthesizing
 *   AND its audio would overlap with the previous sentence's tail.
 *   That's why we use `SpeakerAudioDestination` directly and hook its
 *   `onAudioEnd` — that's the real "playback finished" signal.
 *
 * We rebuild the underlying SpeechSynthesizer per call because the SDK's
 * audio destination is one-shot.
 */
export class AzureTTSClient implements TTSClient {
  private voice: VoiceTuning;
  private current: Speech.SpeechSynthesizer | null = null;
  private currentDest: Speech.SpeakerAudioDestination | null = null;
  private cancelled = false;
  private firstAudioFired = false;

  constructor(voice: VoiceTuning) {
    this.voice = voice;
  }

  setVoice(voice: VoiceTuning): void {
    this.voice = voice;
  }

  async speak(sentence: string, opts: TTSSpeakOptions = {}): Promise<void> {
    if (!sentence.trim()) return;
    this.cancelled = false;

    const config = await buildSpeechConfig();
    config.speechSynthesisVoiceName = this.voice.voiceName;
    // Lower-bitrate MP3 = faster first-audio-byte over the wire.
    // 24 kHz mono at 48kbps is plenty for "phone call" voice quality and
    // shaves measurable ms off Azure → browser delivery vs the SDK default.
    config.speechSynthesisOutputFormat =
      Speech.SpeechSynthesisOutputFormat.Audio24Khz48KBitRateMonoMp3;

    // Custom speaker destination so we can hook the *playback-finished*
    // event (`onAudioEnd`), not just synthesis-finished. This is the
    // single most important detail for clean back-to-back beats.
    const destination = new Speech.SpeakerAudioDestination();
    const audio = Speech.AudioConfig.fromSpeakerOutput(destination);
    const synth = new Speech.SpeechSynthesizer(config, audio);
    this.current = synth;
    this.currentDest = destination;
    this.firstAudioFired = false;

    synth.synthesisStarted = () => {
      if (!this.firstAudioFired) {
        this.firstAudioFired = true;
        opts.onFirstAudio?.();
      }
    };

    const ssml = this.buildSsml(sentence, opts.expression);

    return new Promise<void>((resolve) => {
      let resolved = false;
      let synthesisError: Error | null = null;
      let safety: ReturnType<typeof setTimeout> | null = null;

      const finish = () => {
        if (resolved) return;
        resolved = true;
        if (safety) clearTimeout(safety);
        try {
          synth.close();
        } catch {
          /* swallow */
        }
        if (this.current === synth) this.current = null;
        if (this.currentDest === destination) this.currentDest = null;
        resolve();
      };

      // Real playback-finished signal. Fires after synthesis is complete
      // AND every queued audio chunk has actually drained to the speakers.
      destination.onAudioEnd = () => {
        if (this.cancelled) return finish();
        if (synthesisError) {
          opts.onError?.(synthesisError);
        } else {
          opts.onComplete?.();
        }
        finish();
      };

      synth.speakSsmlAsync(
        ssml,
        (result) => {
          if (this.cancelled) return finish();
          if (
            result.reason !== Speech.ResultReason.SynthesizingAudioCompleted
          ) {
            // No audio will play (e.g. invalid voice name, expired token).
            // Surface the error to the orchestrator NOW so it can fall back
            // to browser TTS — onAudioEnd will never fire in this branch.
            synthesisError = new Error(
              `Azure TTS failed: ${result.errorDetails ?? "unknown"}`,
            );
            opts.onError?.(synthesisError);
            finish();
            return;
          }
          // Safety net: if onAudioEnd never fires (rare SDK edge case
          // — e.g. AudioContext suspended), resolve based on the actual
          // audio duration plus a 750ms cushion so the queue never wedges.
          // audioDuration is in 100-ns ticks → ms = /10_000.
          const ms = Math.ceil((result.audioDuration ?? 0) / 10_000) + 750;
          if (ms > 0) {
            safety = setTimeout(() => {
              if (!resolved) {
                opts.onComplete?.();
                finish();
              }
            }, ms);
          }
        },
        (err) => {
          synthesisError = new Error(
            typeof err === "string" ? err : "TTS error",
          );
          opts.onError?.(synthesisError);
          finish();
        },
      );
    });
  }

  async cancel(): Promise<void> {
    this.cancelled = true;
    const synth = this.current;
    const dest = this.currentDest;
    this.current = null;
    this.currentDest = null;
    if (dest) {
      try {
        // close() stops in-flight playback AND fires `onAudioEnd`, which
        // unblocks any pending speak() promise sitting in the queue.
        dest.close();
      } catch {
        /* swallow */
      }
    }
    if (synth) {
      try {
        synth.close();
      } catch {
        /* swallow */
      }
    }
  }

  async dispose(): Promise<void> {
    await this.cancel();
  }

  private buildSsml(text: string, expr?: ExpressionOverride): string {
    const v = this.voice;
    const inner = humanizeForSsml(text);

    // Per-utterance cue (from "[warm]", "[smirk]", etc.) overrides the
    // personality's default style/styleDegree for THIS sentence only. This
    // is what lets Rizzy shift mood mid-conversation the way ElevenLabs
    // audio tags do.
    const style = expr?.style ?? v.style ?? "chat";
    const styleDeg = expr?.styleDegree ?? v.styleDegree ?? 1.1;
    const styled = `<mstts:express-as style="${style}" styledegree="${styleDeg}">${inner}</mstts:express-as>`;

    // Small `prosody` envelope so each personality has its own signature
    // tempo/pitch even when the underlying voice is shared between modes.
    // Cue can also nudge rate/pitch (e.g. "soft" pulls rate down).
    const rate = expr?.rate ?? v.rate ?? "-2%";
    const pitch = expr?.pitch ?? v.pitch ?? "0%";
    const prosody = `<prosody rate="${rate}" pitch="${pitch}">${styled}</prosody>`;

    return `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xmlns:mstts="http://www.w3.org/2001/mstts" xml:lang="en-US"><voice name="${v.voiceName}">${prosody}</voice></speak>`;
  }
}

/**
 * Pre-process text before XML-escaping so Azure's prosody model has more to
 * work with. The big wins are:
 *   - turning "..." / "—" into real `<break>` tags (Azure mostly ignores
 *     ellipses otherwise, which makes Rizzy sound rushed)
 *   - softening run-on punctuation ("!!" -> "!") so the voice doesn't shout
 *   - guaranteeing a sentence-final punctuation so intonation lands
 */
function humanizeForSsml(raw: string): string {
  let t = raw.trim();
  if (!t) return "";

  // Collapse repeated terminal punctuation: "wait!!" -> "wait!"
  t = t.replace(/([!?.])\1{1,}/g, "$1");

  // Onomatopoeia fixup: bare "Mm." / "Hm." get parsed as the letter
  // sequence M-M / H-M ("em em") by Azure's neural voices. Stretching
  // them to "Mmm" / "Hmm" makes the engine treat them as words and
  // produces an actual humming sound. Same for "Uh" / "Eh".
  t = t.replace(/\b(M)m\b/g, "$1mm");
  t = t.replace(/\b(m)m\b/g, "$1mm");
  t = t.replace(/\b(H)m\b/g, "$1mm");
  t = t.replace(/\b(h)m\b/g, "$1mm");

  // Ensure the sentence ends with terminal punctuation so the voice
  // doesn't trail off flat.
  if (!/[.!?…]$/.test(t)) t = `${t}.`;

  // Escape XML entities BEFORE injecting our own break tags.
  const safe = t
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");

  // Inject natural micro-pauses. Azure handles commas and periods well,
  // but ellipses, em-dashes, and " - " are often steamrolled. Give them
  // explicit breaks so Rizzy breathes.
  return safe
    .replace(/\.{3,}|…/g, '<break time="280ms"/>')
    .replace(/\s—\s|\s--\s|\s-\s/g, '<break time="180ms"/>')
    .replace(/,\s/g, ', <break time="80ms"/>');
}
