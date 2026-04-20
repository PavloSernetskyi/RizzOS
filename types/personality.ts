export type PersonalityKey = "smooth" | "playful" | "savage";

export interface Personality {
  key: PersonalityKey;
  label: string;
  emoji: string;
  tagline: string;
  description: string;
  /**
   * Sent to the voice agent as an override. Keep this tight and in-character.
   */
  systemPrompt: string;
  /**
   * Rotating short lines shown under Rizzy's name while idle.
   */
  idleLines: string[];
  /**
   * A visual accent used across the UI when this personality is active.
   */
  accent: {
    from: string;
    to: string;
    ring: string;
    shadow: string;
    text: string;
  };
}
