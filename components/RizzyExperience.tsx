"use client";

import { useCallback, useMemo, useState } from "react";
import { Hero } from "@/components/Hero";
import { LatencyOverlay } from "@/components/LatencyOverlay";
import { PersonalitySelector } from "@/components/PersonalitySelector";
import { TalkButton } from "@/components/TalkButton";
import { TextFallbackInput } from "@/components/TextFallbackInput";
import { TranscriptPanel } from "@/components/TranscriptPanel";
import { VoiceLab } from "@/components/VoiceLab";
import { useRizzyConversation } from "@/lib/conversationOrchestrator";
import { DEFAULT_PERSONALITY, getPersonality } from "@/lib/personalities";
import type { Message } from "@/types/conversation";
import type { LatencyTurn } from "@/types/latency";
import type { PersonalityKey, VoiceTuning } from "@/types/personality";

const SHOW_VOICE_LAB = process.env.NEXT_PUBLIC_RIZZ_DEBUG === "1";

const EMPTY_OVERRIDES: Record<PersonalityKey, VoiceTuning | null> = {
  smooth: null,
  playful: null,
  savage: null,
};

export function RizzyExperience() {
  const [personalityKey, setPersonalityKey] = useState<PersonalityKey>(
    DEFAULT_PERSONALITY,
  );
  const [messages, setMessages] = useState<Message[]>([]);
  const [lastLatency, setLastLatency] = useState<LatencyTurn | null>(null);
  // Per-personality voice overrides driven by the Voice Lab. In-memory
  // only — refreshing the page restores the personality defaults.
  const [voiceOverrides, setVoiceOverrides] = useState<
    Record<PersonalityKey, VoiceTuning | null>
  >(EMPTY_OVERRIDES);

  const basePersonality = getPersonality(personalityKey);

  // Splice in the Voice Lab override (if any) so the orchestrator's
  // useEffect picks it up the same way it picks up a personality swap.
  const personality = useMemo(() => {
    const override = voiceOverrides[personalityKey];
    if (!override) return basePersonality;
    return { ...basePersonality, voice: override };
  }, [basePersonality, personalityKey, voiceOverrides]);

  const handleMessage = useCallback((m: Message) => {
    setMessages((prev) => {
      // If a streaming Rizzy message stub already exists with this id, replace it.
      const idx = prev.findIndex((p) => p.id === m.id);
      if (idx >= 0) {
        const next = prev.slice();
        next[idx] = m;
        return next;
      }
      return [...prev, m];
    });
  }, []);

  const handleMessageUpdate = useCallback(
    (id: string, text: string, pending: boolean) => {
      setMessages((prev) =>
        prev.map((m) => (m.id === id ? { ...m, text, pending } : m)),
      );
    },
    [],
  );

  const {
    status,
    isActive,
    partialUserText,
    error,
    start,
    stop,
    sendText,
  } = useRizzyConversation({
    personality,
    onMessage: handleMessage,
    onMessageUpdate: handleMessageUpdate,
    onLatency: setLastLatency,
  });

  const handlePersonalityChange = useCallback(
    async (next: PersonalityKey) => {
      if (next === personalityKey) return;
      setPersonalityKey(next);
      // Voice changes apply on the next sentence; conversation history is preserved.
    },
    [personalityKey],
  );

  const handleVoiceOverride = useCallback(
    (key: PersonalityKey, voice: VoiceTuning | null) => {
      setVoiceOverrides((prev) => ({ ...prev, [key]: voice }));
    },
    [],
  );

  return (
    <main className="relative mx-auto flex min-h-[100dvh] w-full max-w-6xl flex-col px-5 pb-8 sm:px-8">
      <div className="flex flex-1 flex-col gap-6 sm:gap-8">
        <div className="grid flex-1 grid-cols-1 items-center gap-6 sm:gap-10 lg:grid-cols-[1.1fr_1fr]">
          <div className="flex flex-col items-center gap-6 pt-2 sm:pt-6">
            <Hero status={status} personality={personality} />

            {partialUserText && (
              <p className="text-xs text-rizz-mute italic max-w-[36ch] text-center -mt-2">
                “{partialUserText}…”
              </p>
            )}

            <div className="flex flex-col items-center gap-5 w-full max-w-md">
              {status === "fallback_text" ? (
                <TextFallbackInput onSend={sendText} />
              ) : (
                <TalkButton
                  status={status}
                  isActive={isActive}
                  personality={personality}
                  onStart={start}
                  onStop={stop}
                />
              )}

              {error && (
                <div
                  role="alert"
                  className="w-full rounded-xl border border-rizz-hot/30 bg-rizz-hot/10 px-4 py-3 text-xs sm:text-sm text-rizz-hot animate-fadeUp"
                >
                  {error}
                </div>
              )}

              <PersonalitySelector
                value={personalityKey}
                onChange={handlePersonalityChange}
              />

              {SHOW_VOICE_LAB && (
                <VoiceLab
                  activePersonality={personalityKey}
                  overrides={voiceOverrides}
                  onOverrideChange={handleVoiceOverride}
                />
              )}
            </div>
          </div>

          <div className="flex w-full flex-col">
            <TranscriptPanel messages={messages} />
          </div>
        </div>
      </div>

      <LatencyOverlay turn={lastLatency} />
    </main>
  );
}
