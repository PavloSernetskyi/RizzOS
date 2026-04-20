"use client";

import { useEffect, useState } from "react";
import { BotOrb } from "@/components/BotOrb";
import { StatusBadge } from "@/components/StatusBadge";
import type { RizzyStatus } from "@/types/conversation";
import type { Personality } from "@/types/personality";

interface HeroProps {
  status: RizzyStatus;
  personality: Personality;
}

export function Hero({ status, personality }: HeroProps) {
  const [lineIdx, setLineIdx] = useState(0);

  // Only rotate idle lines while Rizzy is actually idle.
  useEffect(() => {
    if (status !== "idle") return;
    const id = setInterval(() => {
      setLineIdx((i) => (i + 1) % personality.idleLines.length);
    }, 4200);
    return () => clearInterval(id);
  }, [status, personality.idleLines.length]);

  const dynamicLine =
    status === "idle"
      ? personality.idleLines[lineIdx % personality.idleLines.length]
      : personality.tagline;

  return (
    <section className="relative w-full flex flex-col items-center text-center">
      <div className="relative my-6 sm:my-10">
        <BotOrb status={status} personality={personality} />
      </div>

      <h1
        className="mt-4 sm:mt-6 text-4xl sm:text-6xl font-semibold tracking-tight"
        style={{
          backgroundImage:
            "linear-gradient(180deg, #ffffff 0%, #c9c7ff 70%, #9f9bff 100%)",
          WebkitBackgroundClip: "text",
          backgroundClip: "text",
          color: "transparent",
        }}
      >
        Rizzy
      </h1>

      <div className="mt-3 flex items-center justify-center">
        <StatusBadge status={status} />
      </div>

      <p
        key={`${status}-${lineIdx}`}
        className="mt-3 max-w-[30ch] sm:max-w-[40ch] text-sm sm:text-base text-rizz-ink/80 animate-fadeUp"
      >
        {dynamicLine}
      </p>
    </section>
  );
}
