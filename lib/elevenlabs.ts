"use client";

import { useConversation } from "@elevenlabs/react";
import { useCallback, useMemo, useRef, useState } from "react";
import type { Message, RizzyStatus } from "@/types/conversation";
import type { Personality } from "@/types/personality";

/**
 * Thin, UI-friendly wrapper around ElevenLabs' conversational agent.
 *
 * Responsibilities:
 *   - request microphone access
 *   - start / stop a voice session with the selected personality
 *   - map raw SDK events into RizzyStatus + Message updates
 *
 * The rest of the app only talks to Rizzy through this hook — so we can later
 * swap ElevenLabs for another provider without touching the UI.
 */

export interface UseRizzySessionOptions {
  personality: Personality;
  agentId: string | undefined;
  onMessage?: (message: Message) => void;
  onStatusChange?: (status: RizzyStatus) => void;
  onError?: (error: Error) => void;
}

export interface UseRizzySessionReturn {
  status: RizzyStatus;
  isActive: boolean;
  isConnecting: boolean;
  start: () => Promise<void>;
  stop: () => Promise<void>;
  error: string | null;
}

function uid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

async function fetchSignedUrl(agentId: string): Promise<string | null> {
  try {
    const res = await fetch(
      `/api/eleven/signed-url?agentId=${encodeURIComponent(agentId)}`,
      { method: "GET" },
    );
    if (!res.ok) return null;
    const data = (await res.json()) as { signedUrl?: string };
    return data.signedUrl ?? null;
  } catch {
    return null;
  }
}

export function useRizzySession(
  opts: UseRizzySessionOptions,
): UseRizzySessionReturn {
  const { personality, agentId, onMessage, onStatusChange, onError } = opts;

  const [status, setStatus] = useState<RizzyStatus>("idle");
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const statusRef = useRef<RizzyStatus>("idle");
  const setRizzyStatus = useCallback(
    (next: RizzyStatus) => {
      statusRef.current = next;
      setStatus(next);
      onStatusChange?.(next);
    },
    [onStatusChange],
  );

  const pushMessage = useCallback(
    (speaker: Message["speaker"], text: string) => {
      const trimmed = text?.trim();
      if (!trimmed) return;
      const msg: Message = {
        id: uid(),
        speaker,
        text: trimmed,
        createdAt: Date.now(),
      };
      onMessage?.(msg);
    },
    [onMessage],
  );

  const conversation = useConversation({
    onConnect: () => {
      setIsConnecting(false);
      setError(null);
      setRizzyStatus("listening");
    },
    onDisconnect: () => {
      setIsConnecting(false);
      setRizzyStatus("idle");
    },
    onError: (err: unknown) => {
      setIsConnecting(false);
      const message =
        err instanceof Error
          ? err.message
          : typeof err === "string"
            ? err
            : "Something went wrong with the voice session.";
      setError(message);
      onError?.(err instanceof Error ? err : new Error(message));
      setRizzyStatus("idle");
    },
    onMessage: (raw: unknown) => {
      // The SDK emits { source: "user" | "ai", message: string } for transcripts.
      const r = raw as { source?: string; message?: string } | undefined;
      if (!r?.message) return;
      if (r.source === "user") {
        pushMessage("user", r.message);
      } else if (r.source === "ai") {
        pushMessage("rizzy", r.message);
      }
    },
  });

  /**
   * Derive a higher-level status ("thinking" / "speaking") from the SDK.
   * useConversation exposes `isSpeaking` on the returned object — when true,
   * Rizzy is producing audio. When not speaking and we're connected, she's
   * either listening (default) or thinking (briefly between turns).
   */
  const liveStatus: RizzyStatus = useMemo(() => {
    if (conversation.status !== "connected") return statusRef.current;
    if (conversation.isSpeaking) return "speaking";
    return "listening";
  }, [conversation.status, conversation.isSpeaking]);

  // Mirror derived status into local state so animations react smoothly.
  if (liveStatus !== statusRef.current && conversation.status === "connected") {
    statusRef.current = liveStatus;
    // Defer setState to avoid render-phase updates.
    queueMicrotask(() => {
      setStatus(liveStatus);
      onStatusChange?.(liveStatus);
    });
  }

  const start = useCallback(async () => {
    if (isConnecting || conversation.status === "connected") return;
    setError(null);

    if (!agentId) {
      const msg =
        "Missing NEXT_PUBLIC_ELEVENLABS_AGENT_ID. Add it to .env.local and restart dev.";
      setError(msg);
      onError?.(new Error(msg));
      return;
    }

    try {
      setIsConnecting(true);
      setRizzyStatus("thinking");

      if (
        typeof navigator !== "undefined" &&
        navigator.mediaDevices?.getUserMedia
      ) {
        await navigator.mediaDevices.getUserMedia({ audio: true });
      }

      const signedUrl = await fetchSignedUrl(agentId);

      // Send personality override + a first-message nudge so Rizzy opens in-character.
      const overrides = {
        agent: {
          prompt: { prompt: personality.systemPrompt },
          firstMessage: personality.idleLines[0],
        },
      };

      if (signedUrl) {
        await conversation.startSession({
          signedUrl,
          overrides,
        } as Parameters<typeof conversation.startSession>[0]);
      } else {
        await conversation.startSession({
          agentId,
          overrides,
        } as Parameters<typeof conversation.startSession>[0]);
      }
    } catch (err) {
      setIsConnecting(false);
      const message =
        err instanceof Error
          ? err.message
          : "Couldn't start the voice session.";
      setError(message);
      onError?.(err instanceof Error ? err : new Error(message));
      setRizzyStatus("idle");
    }
  }, [agentId, conversation, isConnecting, onError, personality, setRizzyStatus]);

  const stop = useCallback(async () => {
    try {
      await conversation.endSession();
    } finally {
      setRizzyStatus("idle");
    }
  }, [conversation, setRizzyStatus]);

  const isActive = conversation.status === "connected";

  return {
    status,
    isActive,
    isConnecting,
    start,
    stop,
    error,
  };
}

export const ELEVENLABS_AGENT_ID: string | undefined =
  process.env.NEXT_PUBLIC_ELEVENLABS_AGENT_ID;
