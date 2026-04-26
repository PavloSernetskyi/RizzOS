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
/**
 * 2.3 baseline notes:
 *   - styleDegree was bumped across the board ("more expressive default").
 *     Azure's neural voices are conservative at 1.0 — we push past it.
 *   - Stage-direction cues ([slow], [softly], [energetic]) now actually
 *     adjust prosody rate/pitch instead of just labelling a mood.
 *   - [laughs] / [chuckles] aren't true laugh sounds (Azure's Multilingual
 *     voices don't support `laughing` style) — but we lean cheerful HARD
 *     with a pitch + rate boost so it reads as audibly amused breath
 *     rather than a flat sentence.
 */
const CUE_MAP: Record<string, ExpressionOverride> = {
  // warm / intimate
  warm: { style: "friendly", styleDegree: 1.7 },
  warmly: { style: "friendly", styleDegree: 1.7 },
  soft: { style: "friendly", styleDegree: 1.5, rate: "-8%", pitch: "-1%" },
  softly: { style: "friendly", styleDegree: 1.5, rate: "-8%", pitch: "-1%" },
  tender: { style: "friendly", styleDegree: 1.7, rate: "-6%" },
  gentle: { style: "empathetic", styleDegree: 1.5, rate: "-4%" },
  caring: { style: "empathetic", styleDegree: 1.7 },
  empathetic: { style: "empathetic", styleDegree: 1.7 },

  // smooth / flirty
  smirk: { style: "chat", styleDegree: 1.8, rate: "-2%" },
  smirking: { style: "chat", styleDegree: 1.8, rate: "-2%" },
  smooth: { style: "chat", styleDegree: 1.6, rate: "-4%", pitch: "-1%" },
  flirty: { style: "chat", styleDegree: 1.9, pitch: "-2%", rate: "-2%" },
  flirting: { style: "chat", styleDegree: 1.9, pitch: "-2%", rate: "-2%" },
  chill: { style: "chat", styleDegree: 1.3, rate: "-2%" },
  cool: { style: "chat", styleDegree: 1.3 },

  // bright / playful — laughs lean cheerful HARD + pitch up so they read amused
  laugh: { style: "cheerful", styleDegree: 2.0, rate: "+5%", pitch: "+4%" },
  laughs: { style: "cheerful", styleDegree: 2.0, rate: "+5%", pitch: "+4%" },
  laughing: { style: "cheerful", styleDegree: 2.0, rate: "+5%", pitch: "+4%" },
  chuckle: { style: "cheerful", styleDegree: 1.7, rate: "+2%", pitch: "+2%" },
  chuckles: { style: "cheerful", styleDegree: 1.7, rate: "+2%", pitch: "+2%" },
  amused: { style: "cheerful", styleDegree: 1.5, pitch: "+1%" },
  happy: { style: "cheerful", styleDegree: 1.7, pitch: "+2%" },
  playful: { style: "cheerful", styleDegree: 1.8, rate: "+3%", pitch: "+1%" },
  playfully: { style: "cheerful", styleDegree: 1.8, rate: "+3%", pitch: "+1%" },

  // hyped / excited / energetic
  hype: { style: "excited", styleDegree: 2.0, rate: "+5%", pitch: "+2%" },
  hyped: { style: "excited", styleDegree: 2.0, rate: "+5%", pitch: "+2%" },
  excited: { style: "excited", styleDegree: 1.8, rate: "+4%", pitch: "+1%" },
  excitedly: { style: "excited", styleDegree: 1.8, rate: "+4%", pitch: "+1%" },
  enthusiastic: { style: "excited", styleDegree: 1.8, rate: "+3%" },
  enthusiastically: { style: "excited", styleDegree: 1.8, rate: "+3%" },
  energetic: { style: "excited", styleDegree: 1.8, rate: "+5%", pitch: "+2%" },

  // confident / cocky
  confident: { style: "chat", styleDegree: 1.6 },
  confidently: { style: "chat", styleDegree: 1.6 },
  cocky: { style: "chat", styleDegree: 1.7, rate: "-1%" },

  // dry / sharp / mocking — savage's home turf
  dry: { style: "chat", styleDegree: 0.9, rate: "-1%" },
  deadpan: { style: "chat", styleDegree: 0.5, rate: "-3%" },
  sharp: { style: "chat", styleDegree: 1.2, rate: "+5%" },
  sarcastic: { style: "chat", styleDegree: 1.5, rate: "-2%", pitch: "-1%" },
  mock: { style: "chat", styleDegree: 1.6, rate: "-2%", pitch: "+2%" },
  mocking: { style: "chat", styleDegree: 1.6, rate: "-2%", pitch: "+2%" },

  // curious / thoughtful / hushed
  curious: { style: "chat", styleDegree: 1.4, pitch: "+1%" },
  thoughtful: { style: "chat", styleDegree: 1.1, rate: "-4%" },
  whisper: { style: "whispering", styleDegree: 1.5, rate: "-6%" },
  whispering: { style: "whispering", styleDegree: 1.5, rate: "-6%" },

  // pure stage-direction cues (no mood, just prosody)
  slow: { styleDegree: 1.2, rate: "-12%" },
  slowly: { styleDegree: 1.2, rate: "-12%" },
  fast: { styleDegree: 1.4, rate: "+10%" },
  quick: { styleDegree: 1.4, rate: "+10%" },
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
