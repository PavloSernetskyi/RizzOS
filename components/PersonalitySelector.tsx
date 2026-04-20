"use client";

import {
  PERSONALITIES,
  PERSONALITY_ORDER,
} from "@/lib/personalities";
import type { PersonalityKey } from "@/types/personality";

interface PersonalitySelectorProps {
  value: PersonalityKey;
  onChange: (key: PersonalityKey) => void;
  disabled?: boolean;
}

export function PersonalitySelector({
  value,
  onChange,
  disabled,
}: PersonalitySelectorProps) {
  return (
    <div
      role="radiogroup"
      aria-label="Choose Rizzy's personality"
      className="w-full"
    >
      <div className="grid grid-cols-3 gap-2 sm:gap-3 p-1.5 rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-sm">
        {PERSONALITY_ORDER.map((key) => {
          const p = PERSONALITIES[key];
          const isActive = key === value;
          return (
            <button
              key={key}
              type="button"
              role="radio"
              aria-checked={isActive}
              disabled={disabled}
              onClick={() => onChange(key)}
              className={[
                "relative group flex flex-col items-center justify-center gap-1",
                "rounded-xl px-3 py-3 sm:py-3.5 text-center",
                "transition-all duration-200",
                "disabled:opacity-60 disabled:cursor-not-allowed",
                isActive
                  ? `bg-gradient-to-br ${p.accent.from} ${p.accent.to} text-white shadow-md`
                  : "text-rizz-ink/80 hover:bg-white/[0.05]",
              ].join(" ")}
            >
              <span className="text-xl leading-none" aria-hidden>
                {p.emoji}
              </span>
              <span className="text-[12px] sm:text-sm font-medium tracking-wide">
                {p.label}
              </span>
              {!isActive && (
                <span className="hidden sm:block text-[10px] text-rizz-mute max-w-[14ch] truncate">
                  {p.tagline}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
