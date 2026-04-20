"use client";

import { useCallback, useState } from "react";
import { Hero } from "@/components/Hero";
import { PersonalitySelector } from "@/components/PersonalitySelector";
import { TalkButton } from "@/components/TalkButton";
import { TranscriptPanel } from "@/components/TranscriptPanel";
import { ELEVENLABS_AGENT_ID, useRizzySession } from "@/lib/elevenlabs";
import {
  DEFAULT_PERSONALITY,
  getPersonality,
} from "@/lib/personalities";
import type { Message } from "@/types/conversation";
import type { PersonalityKey } from "@/types/personality";

/**
 * Orchestrates the full Rizzy experience on the client:
 *   - owns conversation + personality state
 *   - connects UI to the ElevenLabs session wrapper
 */
export function RizzyExperience() {
  const [personalityKey, setPersonalityKey] = useState<PersonalityKey>(
    DEFAULT_PERSONALITY,
  );
  const [messages, setMessages] = useState<Message[]>([]);

  const personality = getPersonality(personalityKey);

  const handleMessage = useCallback((m: Message) => {
    setMessages((prev) => [...prev, m]);
  }, []);

  const { status, isActive, isConnecting, start, stop, error } =
    useRizzySession({
      personality,
      agentId: ELEVENLABS_AGENT_ID,
      onMessage: handleMessage,
    });

  const handlePersonalityChange = useCallback(
    async (next: PersonalityKey) => {
      if (next === personalityKey) return;
      setPersonalityKey(next);
      // Personality is sent at session start. If a session is already running,
      // restart it quickly so Rizzy adopts the new mode mid-conversation.
      if (isActive) {
        await stop();
      }
    },
    [personalityKey, isActive, stop],
  );

  return (
    <main className="relative mx-auto flex min-h-[100dvh] w-full max-w-6xl flex-col px-5 pb-8 sm:px-8">
      <div className="flex flex-1 flex-col gap-6 sm:gap-8">
        <div className="grid flex-1 grid-cols-1 items-center gap-6 sm:gap-10 lg:grid-cols-[1.1fr_1fr]">
          {/* Presence column */}
          <div className="flex flex-col items-center gap-6 pt-2 sm:pt-6">
            <Hero status={status} personality={personality} />

            <div className="flex flex-col items-center gap-5 w-full max-w-md">
              <TalkButton
                status={status}
                isActive={isActive}
                isConnecting={isConnecting}
                personality={personality}
                onStart={start}
                onStop={stop}
              />

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
                disabled={isConnecting}
              />
            </div>
          </div>

          {/* Transcript column */}
          <div className="flex w-full flex-col">
            <TranscriptPanel messages={messages} />
          </div>
        </div>
      </div>
    </main>
  );
}
