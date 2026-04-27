"use client";

import type { Personality } from "@/types/personality";

const audioCache = new Map<string, HTMLAudioElement>();
let stopActiveAudio: (() => void) | null = null;

export function getGreetingAudioSrc(
  personality: Pick<Personality, "key">,
  greetingIndex: number,
): string {
  return `/audio/greetings/${personality.key}-${greetingIndex + 1}.mp3`;
}

export function preloadGreetingAudio(
  personality: Pick<Personality, "key" | "idleLines">,
): void {
  if (typeof Audio === "undefined") return;

  personality.idleLines.forEach((_line, index) => {
    const src = getGreetingAudioSrc(personality, index);
    if (audioCache.has(src)) return;

    const audio = new Audio(src);
    audio.preload = "auto";
    audioCache.set(src, audio);

    try {
      audio.load();
    } catch {
      /* best effort */
    }
  });
}

export async function playGreetingAudio(
  personality: Pick<Personality, "key">,
  greetingIndex: number,
): Promise<boolean> {
  if (typeof Audio === "undefined") return false;

  stopGreetingAudio();

  const src = getGreetingAudioSrc(personality, greetingIndex);
  const audio = audioCache.get(src) ?? new Audio(src);
  audioCache.set(src, audio);

  return new Promise<boolean>((resolve) => {
    let settled = false;

    const finish = (played: boolean) => {
      if (settled) return;
      settled = true;
      audio.removeEventListener("ended", onEnded);
      audio.removeEventListener("error", onError);
      if (stopActiveAudio === stopCurrentAudio) stopActiveAudio = null;
      resolve(played);
    };

    const onEnded = () => finish(true);
    const onError = () => finish(false);
    const stopCurrentAudio = () => {
      audio.pause();
      audio.currentTime = 0;
      finish(false);
    };

    audio.addEventListener("ended", onEnded, { once: true });
    audio.addEventListener("error", onError, { once: true });
    audio.currentTime = 0;
    stopActiveAudio = stopCurrentAudio;

    const playPromise = audio.play();
    if (playPromise) {
      playPromise.catch(() => finish(false));
    }
  });
}

export function stopGreetingAudio(): void {
  stopActiveAudio?.();
  stopActiveAudio = null;
}
