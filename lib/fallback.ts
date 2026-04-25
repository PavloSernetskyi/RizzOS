"use client";

import type {
  STTClient,
  STTHandlers,
  TTSClient,
  TTSSpeakOptions,
} from "@/types/provider";

/**
 * Browser-native fallbacks. Activated when Azure tokens fail or the user
 * has explicitly switched to text mode. Quality is meaningfully lower —
 * but Rizzy never goes silent.
 */

export function browserSupportsSTT(): boolean {
  if (typeof window === "undefined") return false;
  return Boolean(
    (window as unknown as { SpeechRecognition?: unknown })
      .SpeechRecognition ||
      (window as unknown as { webkitSpeechRecognition?: unknown })
        .webkitSpeechRecognition,
  );
}

export function browserSupportsTTS(): boolean {
  if (typeof window === "undefined") return false;
  return "speechSynthesis" in window;
}

/* ------------------------------------------------------------------ */
/*                  Browser SpeechRecognition fallback                 */
/* ------------------------------------------------------------------ */

interface BrowserSpeechRecognition {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((e: { results: Array<Array<{ transcript: string }>> & { length: number; isFinal?: boolean } } & { results: { isFinal?: boolean; [k: number]: { transcript: string } }[] }) => void) | null;
  onerror: ((e: { error?: string }) => void) | null;
  onstart: (() => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}

export class BrowserSTTClient implements STTClient {
  private rec: BrowserSpeechRecognition | null = null;
  private listening = false;

  isListening(): boolean {
    return this.listening;
  }

  async start(handlers: STTHandlers): Promise<void> {
    if (!browserSupportsSTT()) {
      handlers.onError(new Error("Browser does not support speech recognition."));
      return;
    }

    const Ctor =
      (window as unknown as { SpeechRecognition?: new () => BrowserSpeechRecognition })
        .SpeechRecognition ??
      (window as unknown as { webkitSpeechRecognition?: new () => BrowserSpeechRecognition })
        .webkitSpeechRecognition;

    if (!Ctor) {
      handlers.onError(new Error("SpeechRecognition unavailable."));
      return;
    }

    const rec = new Ctor();
    rec.lang = "en-US";
    rec.continuous = true;
    rec.interimResults = true;
    this.rec = rec;

    rec.onstart = () => {
      this.listening = true;
      handlers.onSpeechStart?.();
    };

    rec.onresult = (e) => {
      const results = e.results;
      const last = results[results.length - 1];
      if (!last) return;
      const transcript = (last as unknown as { 0: { transcript: string } })[0]
        .transcript;
      const isFinal = (last as unknown as { isFinal: boolean }).isFinal;
      if (isFinal) {
        handlers.onSpeechEnd?.();
        if (transcript.trim()) handlers.onFinal(transcript.trim());
      } else {
        handlers.onPartial?.(transcript);
      }
    };

    rec.onerror = (e) => {
      handlers.onError(new Error(e.error ?? "speech recognition error"));
    };

    rec.onend = () => {
      this.listening = false;
    };

    rec.start();
  }

  async stop(): Promise<void> {
    if (!this.rec) {
      this.listening = false;
      return;
    }
    try {
      this.rec.stop();
    } catch {
      /* swallow */
    }
    this.listening = false;
  }

  async dispose(): Promise<void> {
    await this.stop();
    this.rec = null;
  }
}

/* ------------------------------------------------------------------ */
/*                 Browser SpeechSynthesis fallback (TTS)              */
/* ------------------------------------------------------------------ */

export class BrowserTTSClient implements TTSClient {
  private current: SpeechSynthesisUtterance | null = null;

  async speak(sentence: string, opts: TTSSpeakOptions = {}): Promise<void> {
    if (!browserSupportsTTS()) {
      opts.onError?.(new Error("Browser TTS unavailable."));
      return;
    }
    if (!sentence.trim()) return;

    return new Promise<void>((resolve) => {
      const u = new SpeechSynthesisUtterance(sentence);
      u.rate = 1.05;
      u.pitch = 1.0;

      // Pick the most natural-sounding voice we can find.
      const voices = window.speechSynthesis.getVoices();
      const preferred =
        voices.find((v) => /natural|neural|enhanced/i.test(v.name)) ||
        voices.find((v) => v.lang.startsWith("en"));
      if (preferred) u.voice = preferred;

      let firstFired = false;
      u.onstart = () => {
        if (!firstFired) {
          firstFired = true;
          opts.onFirstAudio?.();
        }
      };
      u.onend = () => {
        opts.onComplete?.();
        this.current = null;
        resolve();
      };
      u.onerror = (e) => {
        const reason =
          (e as unknown as { error?: string }).error ?? "unknown";
        opts.onError?.(new Error(`browser TTS error: ${reason}`));
        this.current = null;
        resolve();
      };

      this.current = u;
      window.speechSynthesis.speak(u);
    });
  }

  async cancel(): Promise<void> {
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
    this.current = null;
  }

  async dispose(): Promise<void> {
    await this.cancel();
  }
}
