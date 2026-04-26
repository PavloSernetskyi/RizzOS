export type PersonalityKey = "smooth" | "playful" | "savage";

/**
 * Tunable knobs that affect "rizz quality" — all of these are passed to
 * Groq at request time. Centralized so the orchestrator + prompt builder
 * agree on the same numbers per personality.
 *
 * Quick reference for tuning when Rizzy feels "off":
 *   - feeling BORING / REPETITIVE  →  raise temperature, raise frequencyPenalty
 *   - feeling RAMBLY / RUNS LONG   →  lower maxTokens
 *   - keeps revisiting same topic  →  raise presencePenalty
 *   - going OFF THE RAILS / weird  →  lower temperature
 */
export interface ResponseTuning {
  /** Hard cap on tokens we'll let Groq generate. Keeps replies snappy. */
  maxTokens: number;
  /** 0–1.5. Higher = more creative / chaotic. Sweet spot 0.85–1.05. */
  temperature: number;
  /** -2..2. Higher = avoids word/phrase repetition. 0.3–0.6 sweet spot. */
  frequencyPenalty: number;
  /** -2..2. Higher = forces new topics each turn. 0.2–0.4 sweet spot. */
  presencePenalty: number;
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
