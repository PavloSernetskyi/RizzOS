export type PersonalityKey = "smooth" | "playful" | "savage";

/**
 * Tunable knobs that affect "rizz quality" — both prompt-side and runtime.
 * Centralized so the orchestrator + prompt builder agree on the same numbers.
 */
export interface ResponseTuning {
  /** Soft target for reply length. Used in the prompt + as max_tokens hint. */
  maxWords: number;
  /** Hard cap on tokens we'll let Groq generate. Keeps replies snappy. */
  maxTokens: number;
  /** 0–1. Higher = more creative / chaotic. */
  temperature: number;
  /** 0–10. Influences the prompt tone. Pure flavor. */
  sassLevel: number;
}

/**
 * Voice config for Azure TTS. Lives in personality so each mode can
 * sound subtly different (faster, brighter, sharper) without changing
 * the underlying voice actor.
 */
export interface VoiceTuning {
  /** Azure neural voice short name, e.g. "en-US-AndrewMultilingualNeural". */
  voiceName: string;
  /** Azure expression style: "chat", "friendly", "excited", etc. Optional. */
  style?: string;
  /** -50% .. +50% — speaking rate. */
  rate?: string;
  /** -50% .. +50% — pitch shift. */
  pitch?: string;
  /** 0..2 — degree of style intensity (Azure SSML). */
  styleDegree?: number;
}

export interface Personality {
  key: PersonalityKey;
  label: string;
  emoji: string;
  tagline: string;
  description: string;
  systemPrompt: string;
  idleLines: string[];
  response: ResponseTuning;
  voice: VoiceTuning;
  accent: {
    from: string;
    to: string;
    ring: string;
    shadow: string;
    text: string;
  };
}
