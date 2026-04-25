"use client";

import * as Speech from "microsoft-cognitiveservices-speech-sdk";
import type {
  STTClient,
  STTHandlers,
  TTSClient,
  TTSSpeakOptions,
} from "@/types/provider";
import type { VoiceTuning } from "@/types/personality";

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
 * We rebuild the underlying SpeechSynthesizer per call. This is the most
 * reliable path on browsers — the SDK's audio destination is one-shot.
 */
export class AzureTTSClient implements TTSClient {
  private voice: VoiceTuning;
  private current: Speech.SpeechSynthesizer | null = null;
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

    const audio = Speech.AudioConfig.fromDefaultSpeakerOutput();
    const synth = new Speech.SpeechSynthesizer(config, audio);
    this.current = synth;
    this.firstAudioFired = false;

    // The SDK fires synthesisStarted right before audio begins playing.
    synth.synthesisStarted = () => {
      if (!this.firstAudioFired) {
        this.firstAudioFired = true;
        opts.onFirstAudio?.();
      }
    };

    const ssml = this.buildSsml(sentence);

    return new Promise<void>((resolve) => {
      synth.speakSsmlAsync(
        ssml,
        (result) => {
          synth.close();
          if (this.current === synth) this.current = null;
          if (this.cancelled) {
            resolve();
            return;
          }
          if (result.reason === Speech.ResultReason.SynthesizingAudioCompleted) {
            opts.onComplete?.();
          } else {
            opts.onError?.(
              new Error(
                `Azure TTS failed: ${result.errorDetails ?? "unknown"}`,
              ),
            );
          }
          resolve();
        },
        (err) => {
          synth.close();
          if (this.current === synth) this.current = null;
          opts.onError?.(new Error(typeof err === "string" ? err : "TTS error"));
          resolve();
        },
      );
    });
  }

  async cancel(): Promise<void> {
    this.cancelled = true;
    const synth = this.current;
    this.current = null;
    if (!synth) return;
    try {
      await new Promise<void>((resolve) => {
        synth.close();
        resolve();
      });
    } catch {
      /* swallow */
    }
  }

  async dispose(): Promise<void> {
    await this.cancel();
  }

  private buildSsml(text: string): string {
    const v = this.voice;
    const safe = escapeXml(text);
    const styled = v.style
      ? `<mstts:express-as style="${v.style}" styledegree="${v.styleDegree ?? 1}">${safe}</mstts:express-as>`
      : safe;
    const prosody =
      v.rate || v.pitch
        ? `<prosody rate="${v.rate ?? "0%"}" pitch="${v.pitch ?? "0%"}">${styled}</prosody>`
        : styled;

    return `
<speak version="1.0"
       xmlns="http://www.w3.org/2001/10/synthesis"
       xmlns:mstts="http://www.w3.org/2001/mstts"
       xml:lang="en-US">
  <voice name="${v.voiceName}">
    ${prosody}
  </voice>
</speak>`.trim();
  }
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
