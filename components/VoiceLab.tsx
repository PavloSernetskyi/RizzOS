"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AzureTTSClient } from "@/lib/azure";
import { parseLeadingCue, stripAllCues } from "@/lib/expression";
import { VOICE_CATALOG, type VoiceOption } from "@/lib/voiceCatalog";
import { PERSONALITIES } from "@/lib/personalities";
import type { PersonalityKey, VoiceTuning } from "@/types/personality";

interface VoiceLabProps {
  /** Currently active personality — Voice Lab applies overrides to this one. */
  activePersonality: PersonalityKey;
  /** Override map indexed by personality key. */
  overrides: Record<PersonalityKey, VoiceTuning | null>;
  /** Set or clear an override for a given personality. */
  onOverrideChange: (
    personality: PersonalityKey,
    voice: VoiceTuning | null,
  ) => void;
}

/**
 * Voice Lab — temporary debug-only UI for auditioning Azure neural voices
 * against each personality. Lets the user A/B male/female voices, hear
 * a short sample, and lock in their pick per mode.
 *
 * Picks here override the personality's default voice for the rest of
 * the session. They reset on page reload (we don't persist deliberately
 * — this is a tuning tool, not a user preference).
 *
 * Hidden unless NEXT_PUBLIC_RIZZ_DEBUG === "1". Gating in the render path
 * keeps it out of production bundles when the flag is off.
 */
export function VoiceLab({
  activePersonality,
  overrides,
  onOverrideChange,
}: VoiceLabProps) {
  const [open, setOpen] = useState(false);
  const [previewing, setPreviewing] = useState<string | null>(null);
  const ttsRef = useRef<AzureTTSClient | null>(null);

  // Lazily build a private TTS client for previews so we don't compete
  // with the main conversation orchestrator's client.
  const getTts = useCallback((voice: VoiceTuning) => {
    if (!ttsRef.current) {
      ttsRef.current = new AzureTTSClient(voice);
    } else {
      ttsRef.current.setVoice(voice);
    }
    return ttsRef.current;
  }, []);

  useEffect(() => {
    return () => {
      ttsRef.current?.dispose().catch(() => {});
      ttsRef.current = null;
    };
  }, []);

  const personalityMeta = PERSONALITIES[activePersonality];
  const activeOverride = overrides[activePersonality] ?? null;

  // Determine which voice id is currently in use for the active mode.
  const activeVoiceName =
    activeOverride?.voiceName ?? personalityMeta.voice.voiceName;

  const groups = useMemo(
    () => ({
      male: VOICE_CATALOG.filter((v) => v.gender === "male"),
      female: VOICE_CATALOG.filter((v) => v.gender === "female"),
    }),
    [],
  );

  const previewVoice = useCallback(
    async (voice: VoiceOption) => {
      if (previewing) {
        await ttsRef.current?.cancel().catch(() => {});
      }
      setPreviewing(voice.id);
      const tts = getTts(voice.tuning);

      // Mirror what the orchestrator does: parse the leading cue so
      // the sample line uses the right SSML expression, and strip any
      // remaining bracketed tags from the spoken text.
      const parsed = parseLeadingCue(voice.sample);
      const speakText = stripAllCues(parsed.cleanText);

      try {
        await tts.speak(speakText, { expression: parsed.expression });
      } catch {
        /* swallow — preview is best-effort */
      } finally {
        setPreviewing((cur) => (cur === voice.id ? null : cur));
      }
    },
    [getTts, previewing],
  );

  const stopPreview = useCallback(async () => {
    await ttsRef.current?.cancel().catch(() => {});
    setPreviewing(null);
  }, []);

  const applyVoice = useCallback(
    (voice: VoiceOption) => {
      onOverrideChange(activePersonality, voice.tuning);
    },
    [activePersonality, onOverrideChange],
  );

  const resetVoice = useCallback(() => {
    onOverrideChange(activePersonality, null);
  }, [activePersonality, onOverrideChange]);

  return (
    <div className="w-full">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full text-[11px] uppercase tracking-[0.2em] text-rizz-mute hover:text-rizz-ink/80 transition-colors py-2"
      >
        {open ? "▾ Voice Lab — close" : "▸ Voice Lab — try other voices"}
      </button>

      {open && (
        <div className="mt-2 rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-sm p-4 space-y-4 animate-fadeUp">
          <div className="flex items-center justify-between text-xs">
            <div className="text-rizz-mute">
              Auditioning for{" "}
              <span className="text-rizz-ink font-medium">
                {personalityMeta.emoji} {personalityMeta.label}
              </span>
            </div>
            {activeOverride && (
              <button
                type="button"
                onClick={resetVoice}
                className="text-rizz-accent hover:text-rizz-accent/80 transition-colors"
              >
                Reset to default
              </button>
            )}
          </div>

          <VoiceGroup
            title="Male"
            voices={groups.male}
            activeVoiceName={activeVoiceName}
            previewing={previewing}
            onPreview={previewVoice}
            onStop={stopPreview}
            onApply={applyVoice}
          />

          <VoiceGroup
            title="Female"
            voices={groups.female}
            activeVoiceName={activeVoiceName}
            previewing={previewing}
            onPreview={previewVoice}
            onStop={stopPreview}
            onApply={applyVoice}
          />

          <p className="text-[10px] text-rizz-mute/70 leading-relaxed pt-1 border-t border-white/5">
            Picks override that mode for this session only. Refresh resets to defaults.
          </p>
        </div>
      )}
    </div>
  );
}

interface VoiceGroupProps {
  title: string;
  voices: VoiceOption[];
  activeVoiceName: string;
  previewing: string | null;
  onPreview: (voice: VoiceOption) => void;
  onStop: () => void;
  onApply: (voice: VoiceOption) => void;
}

function VoiceGroup({
  title,
  voices,
  activeVoiceName,
  previewing,
  onPreview,
  onStop,
  onApply,
}: VoiceGroupProps) {
  return (
    <div>
      <h3 className="text-[10px] uppercase tracking-[0.2em] text-rizz-mute mb-2">
        {title}
      </h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {voices.map((v) => {
          const isActive = v.tuning.voiceName === activeVoiceName;
          const isPreviewing = previewing === v.id;
          return (
            <div
              key={v.id}
              className={[
                "rounded-xl border p-3 transition-colors",
                isActive
                  ? "border-rizz-accent/50 bg-rizz-accent/5"
                  : "border-white/10 bg-white/[0.02] hover:bg-white/[0.04]",
              ].join(" ")}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-sm font-medium text-rizz-ink flex items-center gap-1.5">
                    {v.label}
                    {isActive && (
                      <span className="text-[9px] uppercase tracking-wider text-rizz-accent">
                        in use
                      </span>
                    )}
                  </div>
                  <div className="text-[11px] text-rizz-mute leading-snug mt-0.5">
                    {v.blurb}
                  </div>
                </div>
              </div>
              <div className="flex gap-1.5 mt-2.5">
                <button
                  type="button"
                  onClick={() => (isPreviewing ? onStop() : onPreview(v))}
                  className="flex-1 text-[11px] py-1.5 rounded-lg border border-white/10 hover:bg-white/[0.06] transition-colors text-rizz-ink/90"
                >
                  {isPreviewing ? "■ Stop" : "▶ Preview"}
                </button>
                <button
                  type="button"
                  onClick={() => onApply(v)}
                  disabled={isActive}
                  className="flex-1 text-[11px] py-1.5 rounded-lg bg-rizz-accent/15 hover:bg-rizz-accent/25 disabled:opacity-40 disabled:cursor-not-allowed transition-colors text-rizz-accent font-medium"
                >
                  Use
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
