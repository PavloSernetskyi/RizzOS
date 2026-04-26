/**
 * Emotion cue → Azure SSML expression mapping.
 *
 * The LLM is instructed to prefix each line with a bracketed cue, e.g.
 * "[warm] Hey there, what's up?" or "[smirk] You finally showed up."
 *
 * Why we do this on top of Groq + Azure:
 *   - Groq's text alone has no prosody control.
 *   - Azure neural voices DO support emotional styles via
 *     `<mstts:express-as style="..." styledegree="...">`, but only if
 *     someone tells them which style to use per utterance.
 *   - Letting the model emit the cue gets us the same "feels alive"
 *     dynamic-tone effect ElevenLabs' audio tags give for free.
 *
 * The cue we extract here is also kept VISIBLE in the transcript — that's
 * intentional. ElevenLabs surfaces tags in their UI for the same reason:
 * the user reads Rizzy's mood, not just his words.
 */

export interface ExpressionOverride {
  /** Azure express-as style. Falls back to the personality's default if absent. */
  style?: string;
  /** 0.01 – 2.0. Higher = more exaggerated delivery. */
  styleDegree?: number;
  /** SSML rate, e.g. "+5%", "-4%". */
  rate?: string;
  /** SSML pitch, e.g. "+2%", "-1%". */
  pitch?: string;
}

/**
 * Map of cue label → Azure SSML override.
 *
 * Style names below are all from Microsoft's documented set; not every
 * voice supports every style, but Azure gracefully falls back to default
 * delivery when an unsupported style is requested — so this is safe.
 */
const CUE_MAP: Record<string, ExpressionOverride> = {
  // warm / intimate
  warm: { style: "friendly", styleDegree: 1.5 },
  warmly: { style: "friendly", styleDegree: 1.5 },
  soft: { style: "friendly", styleDegree: 1.3, rate: "-6%" },
  gentle: { style: "empathetic", styleDegree: 1.3 },
  caring: { style: "empathetic", styleDegree: 1.4 },
  empathetic: { style: "empathetic", styleDegree: 1.4 },

  // smooth / flirty
  smirk: { style: "chat", styleDegree: 1.6, rate: "-2%" },
  smirking: { style: "chat", styleDegree: 1.6, rate: "-2%" },
  smooth: { style: "chat", styleDegree: 1.3, rate: "-3%" },
  flirty: { style: "chat", styleDegree: 1.6, pitch: "-1%" },
  flirting: { style: "chat", styleDegree: 1.6, pitch: "-1%" },
  chill: { style: "chat", styleDegree: 1.0 },
  cool: { style: "chat", styleDegree: 1.1 },

  // bright / playful
  laugh: { style: "cheerful", styleDegree: 1.7 },
  laughs: { style: "cheerful", styleDegree: 1.7 },
  laughing: { style: "cheerful", styleDegree: 1.7 },
  chuckle: { style: "cheerful", styleDegree: 1.4 },
  chuckles: { style: "cheerful", styleDegree: 1.4 },
  amused: { style: "cheerful", styleDegree: 1.3 },
  playful: { style: "cheerful", styleDegree: 1.5, rate: "+3%" },
  playfully: { style: "cheerful", styleDegree: 1.5, rate: "+3%" },

  // hyped / excited
  hype: { style: "excited", styleDegree: 1.7, rate: "+4%" },
  hyped: { style: "excited", styleDegree: 1.7, rate: "+4%" },
  excited: { style: "excited", styleDegree: 1.6, rate: "+3%" },
  excitedly: { style: "excited", styleDegree: 1.6, rate: "+3%" },
  enthusiastic: { style: "excited", styleDegree: 1.6 },
  enthusiastically: { style: "excited", styleDegree: 1.6 },

  // confident / cocky
  confident: { style: "chat", styleDegree: 1.4 },
  confidently: { style: "chat", styleDegree: 1.4 },
  cocky: { style: "chat", styleDegree: 1.5, rate: "-1%" },

  // dry / sharp
  dry: { style: "chat", styleDegree: 0.8 },
  deadpan: { style: "chat", styleDegree: 0.6 },
  sharp: { style: "chat", styleDegree: 1.0, rate: "+5%" },
  sarcastic: { style: "chat", styleDegree: 1.2, rate: "-2%" },

  // curious / thoughtful
  curious: { style: "chat", styleDegree: 1.3 },
  thoughtful: { style: "chat", styleDegree: 1.0, rate: "-3%" },
  whisper: { style: "whispering", styleDegree: 1.3, rate: "-5%" },
  whispering: { style: "whispering", styleDegree: 1.3, rate: "-5%" },
};

const CUE_REGEX = /^\s*\[([^\]\n]{1,30})\]\s*/;

export interface ParsedCue {
  /** Sentence text with the leading cue removed. */
  cleanText: string;
  /** Lowercased label found in brackets, e.g. "warm". */
  label?: string;
  /** Resolved Azure SSML override for this cue, if recognised. */
  expression?: ExpressionOverride;
}

/**
 * Pull a leading "[cue]" off a sentence. Unrecognised cues still get
 * stripped from the text (so Azure doesn't read them aloud) but produce
 * no expression override — Rizzy just continues with the previous mood.
 */
export function parseLeadingCue(text: string): ParsedCue {
  const m = text.match(CUE_REGEX);
  if (!m) return { cleanText: text };

  const raw = m[1].trim().toLowerCase();
  // Tolerate multi-word cues like "warmly smiling" — first word wins.
  const first = raw.split(/[\s,]+/)[0];

  return {
    cleanText: text.replace(CUE_REGEX, ""),
    label: first,
    expression: CUE_MAP[first],
  };
}

/** True if a cue label maps to a known SSML style. */
export function isKnownCue(label: string): boolean {
  return Object.prototype.hasOwnProperty.call(CUE_MAP, label.toLowerCase());
}

/**
 * Sweep ANY remaining bracketed cues out of a string. Defensive cleanup
 * for text headed to TTS — the leading cue is already extracted by
 * parseLeadingCue, but if the model writes mid-sentence cues like
 * "[Warmly] doing great [Smirking] you?" we don't want Azure literally
 * pronouncing "smirking" or "warmly" inside the speech.
 *
 * This does NOT touch the transcript shown to the user; UI components
 * keep cues visible so the user reads Rizzy's mood shifts.
 */
const ANY_CUE_REGEX = /\[[^\]\n]{1,30}\]/g;
export function stripAllCues(text: string): string {
  return text.replace(ANY_CUE_REGEX, "").replace(/\s{2,}/g, " ").trim();
}
