import type { VoiceTuning } from "@/types/personality";

/**
 * Curated catalog for the Voice Lab — a temporary tool to A/B Azure
 * neural voices against each personality's mood. We pick voices that
 * Azure's docs flag as "high naturalness" + that support the styles
 * we lean on (chat / friendly / cheerful / excited / narration-relaxed).
 *
 * Multilingual variants are preferred — they're trained on more data
 * and handle SSML express-as styles more reliably than the standard
 * Neural voices.
 *
 * Each entry includes default tuning that's a sensible "cold-start"
 * for that voice. The user can switch a personality to any of these
 * and Rizzy will use the entry's tuning for that personality.
 */
export interface VoiceOption {
  /** Stable id used in UI selection state. */
  id: string;
  /** Friendly label shown in the picker. */
  label: string;
  /** Short character description. */
  blurb: string;
  /** "male" | "female" — for grouping in the UI only. */
  gender: "male" | "female";
  /** The actual voice tuning Rizzy will use when this voice is picked. */
  tuning: VoiceTuning;
  /** Sample line used when the user taps "preview". */
  sample: string;
}

/* ── MALE ─────────────────────────────────────────────── */

const MALE: VoiceOption[] = [
  {
    id: "andrew-multi",
    label: "Andrew",
    blurb: "Warm, conversational, half-smile. (Smooth default)",
    gender: "male",
    tuning: {
      voiceName: "en-US-AndrewMultilingualNeural",
      style: "chat",
      rate: "-3%",
      pitch: "-1%",
      styleDegree: 1.6,
    },
    sample: "[smooth] Hey you. [smirk] Took you long enough — what's the move tonight?",
  },
  {
    id: "brian-multi",
    label: "Brian",
    blurb: "Friendly, lively, very natural cadence.",
    gender: "male",
    tuning: {
      voiceName: "en-US-BrianMultilingualNeural",
      style: "chat",
      rate: "+3%",
      pitch: "+1%",
      styleDegree: 1.7,
    },
    sample: "[playful] Yo, you're back! [chuckles] Spill — what'd I miss?",
  },
  {
    id: "christopher-multi",
    label: "Christopher",
    blurb: "Confident, dry, slight edge.",
    gender: "male",
    tuning: {
      voiceName: "en-US-ChristopherMultilingualNeural",
      style: "narration-relaxed",
      rate: "0%",
      pitch: "-2%",
      styleDegree: 1.7,
    },
    sample: "[dry] Took you long enough. [smirk] Alright, hit me — I don't bite. Much.",
  },
  {
    id: "ryan-multi",
    label: "Ryan",
    blurb: "Bright, enthusiastic, friendly DJ vibe.",
    gender: "male",
    tuning: {
      voiceName: "en-US-RyanMultilingualNeural",
      style: "chat",
      rate: "+1%",
      pitch: "0%",
      styleDegree: 1.6,
    },
    sample: "[hype] Alright alright! [smirk] What kinda chaos we starting tonight?",
  },
  {
    id: "davis",
    label: "Davis",
    blurb: "Casual, expressive, slightly raspy. (Savage default)",
    gender: "male",
    tuning: {
      voiceName: "en-US-DavisNeural",
      style: "chat",
      rate: "-1%",
      pitch: "-1%",
      styleDegree: 1.7,
    },
    sample: "[chill] Yeah, I see you. [smirk] What's the story tonight?",
  },
  {
    id: "tony",
    label: "Tony",
    blurb: "Smooth, deeper, late-night radio.",
    gender: "male",
    tuning: {
      voiceName: "en-US-TonyNeural",
      style: "chat",
      rate: "-2%",
      pitch: "-2%",
      styleDegree: 1.5,
    },
    sample: "[smooth] Mmm. [warm] Tell me something good.",
  },
];

/* ── FEMALE ───────────────────────────────────────────── */

const FEMALE: VoiceOption[] = [
  {
    id: "ava-multi",
    label: "Ava",
    blurb: "Highly natural, conversational, modern.",
    gender: "female",
    tuning: {
      voiceName: "en-US-AvaMultilingualNeural",
      style: "chat",
      rate: "-1%",
      pitch: "0%",
      styleDegree: 1.7,
    },
    sample: "[warm] Hey you. [smirk] Finally — what's the move tonight?",
  },
  {
    id: "emma-multi",
    label: "Emma",
    blurb: "Bright, friendly, slightly playful. (Playful default)",
    gender: "female",
    tuning: {
      voiceName: "en-US-EmmaMultilingualNeural",
      style: "chat",
      rate: "+1%",
      pitch: "+1%",
      styleDegree: 1.7,
    },
    sample: "[playful] Heeey, look who's here! [chuckles] Spill the tea.",
  },
  {
    id: "jenny-multi",
    label: "Jenny",
    blurb: "Cheerful, welcoming, bouncy.",
    gender: "female",
    tuning: {
      voiceName: "en-US-JennyMultilingualNeural",
      style: "chat",
      rate: "+2%",
      pitch: "+1%",
      styleDegree: 1.7,
    },
    sample: "[hype] Yo yo yo! [playful] What're we getting into tonight?",
  },
  {
    id: "aria",
    label: "Aria",
    blurb: "Warm, articulate, lightly flirty.",
    gender: "female",
    tuning: {
      voiceName: "en-US-AriaNeural",
      style: "chat",
      rate: "-1%",
      pitch: "0%",
      styleDegree: 1.6,
    },
    sample: "[warm] There you are. [smirk] What kept you?",
  },
  {
    id: "nancy",
    label: "Nancy",
    blurb: "Cool, smooth, dryly amused.",
    gender: "female",
    tuning: {
      voiceName: "en-US-NancyNeural",
      style: "chat",
      rate: "-1%",
      pitch: "-1%",
      styleDegree: 1.5,
    },
    sample: "[dry] Oh — you again. [smirk] Lucky me.",
  },
];

export const VOICE_CATALOG: VoiceOption[] = [...MALE, ...FEMALE];

export function findVoiceByName(voiceName: string): VoiceOption | undefined {
  return VOICE_CATALOG.find((v) => v.tuning.voiceName === voiceName);
}
