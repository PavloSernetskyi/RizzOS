export type Speaker = "user" | "rizzy";

export interface Message {
  id: string;
  speaker: Speaker;
  text: string;
  createdAt: number;
  /** Marks messages still streaming/being typed by Rizzy. */
  pending?: boolean;
}

/**
 * Full conversational state machine for Rizzy.
 *   idle              — nothing happening
 *   listening         — mic open, waiting for / hearing user
 *   processing        — got transcript, asking Groq
 *   speaking          — Rizzy is talking (TTS audio is playing)
 *   error_retry       — recoverable error, user can retry
 *   fallback_text     — voice path is unavailable; text input only
 */
export type RizzyStatus =
  | "idle"
  | "listening"
  | "processing"
  | "speaking"
  | "error_retry"
  | "fallback_text";

export interface ConversationTurn {
  userText: string;
  rizzyText: string;
}
