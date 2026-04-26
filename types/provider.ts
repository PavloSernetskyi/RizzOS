/**
 * Provider-agnostic shapes. The orchestrator only depends on these —
 * concrete providers (Azure, Groq, browser fallbacks) implement them.
 *
 * Swapping a provider later (say Groq → OpenAI) means writing a new
 * implementation of these interfaces, not editing the UI.
 */

import type { ExpressionOverride } from "@/lib/expression";

export interface STTClient {
  /** Open the mic and begin streaming recognition. */
  start(handlers: STTHandlers): Promise<void>;
  /** Stop the mic. Resolves when fully closed. */
  stop(): Promise<void>;
  /** True while actively listening. */
  isListening(): boolean;
  /** Tear down all resources. Idempotent. */
  dispose(): Promise<void>;
}

export interface STTHandlers {
  onPartial?: (text: string) => void;
  onFinal: (text: string) => void;
  onError: (err: Error) => void;
  onSpeechStart?: () => void;
  onSpeechEnd?: () => void;
}

export interface TTSClient {
  /** Speak a single sentence. Resolves when audio finishes playing. */
  speak(sentence: string, opts?: TTSSpeakOptions): Promise<void>;
  /** Cancel any queued / in-flight speech immediately. */
  cancel(): Promise<void>;
  /** Tear down all resources. Idempotent. */
  dispose(): Promise<void>;
}

export interface TTSSpeakOptions {
  onFirstAudio?: () => void;
  onComplete?: () => void;
  onError?: (err: Error) => void;
  /**
   * Per-call SSML override sourced from a parsed emotion cue (e.g. `[warm]`).
   * Lets a single utterance change voice mood without swapping the whole
   * personality. Browser fallback ignores this field.
   */
  expression?: ExpressionOverride;
}

export interface LLMClient {
  /** Stream a chat completion as plain-text chunks. */
  stream(
    messages: LLMMessage[],
    handlers: LLMStreamHandlers,
    opts: LLMOptions,
  ): Promise<void>;
}

export interface LLMMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface LLMOptions {
  temperature: number;
  maxTokens: number;
  /** -2..2. Higher = avoids repeating the same words/phrases. */
  frequencyPenalty?: number;
  /** -2..2. Higher = forces variety in topics each turn. */
  presencePenalty?: number;
  signal?: AbortSignal;
}

export interface LLMStreamHandlers {
  onFirstToken?: () => void;
  onChunk: (chunk: string) => void;
  onComplete: (full: string) => void;
  onError: (err: Error) => void;
}
