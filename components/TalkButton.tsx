"use client";

import type { RizzyStatus } from "@/types/conversation";
import type { Personality } from "@/types/personality";

interface TalkButtonProps {
  status: RizzyStatus;
  isActive: boolean;
  personality: Personality;
  onStart: () => void;
  onStop: () => void;
}

export function TalkButton({
  status,
  isActive,
  personality,
  onStart,
  onStop,
}: TalkButtonProps) {
  const isConnecting = status === "processing" && !isActive;

  const label =
    status === "error_retry"
      ? "Try again"
      : isConnecting
        ? "Connecting…"
        : isActive
          ? "End"
          : "Talk to Rizzy";

  const handleClick = () => {
    if (isActive) onStop();
    else onStart();
  };

  return (
    <div className="flex flex-col items-center gap-3">
      <button
        type="button"
        onClick={handleClick}
        disabled={status === "fallback_text"}
        aria-pressed={isActive}
        aria-label={isActive ? "End conversation" : "Start talking to Rizzy"}
        className={[
          "group relative inline-flex items-center justify-center",
          "h-16 sm:h-14 min-w-[220px] px-8 rounded-full",
          "text-base sm:text-sm font-semibold tracking-wide",
          "transition-all duration-300 select-none",
          "disabled:opacity-50 disabled:cursor-not-allowed",
          isActive
            ? "bg-white/10 text-rizz-ink border border-white/15 hover:bg-white/15"
            : `bg-gradient-to-r ${personality.accent.from} ${personality.accent.to} text-white shadow-lg ${personality.accent.shadow} hover:scale-[1.02] active:scale-[0.98]`,
        ].join(" ")}
      >
        {(status === "listening" || status === "speaking") && (
          <span className="absolute -inset-1 rounded-full ring-1 ring-white/20 animate-pulseSoft" />
        )}

        {!isActive && status !== "error_retry" && !isConnecting && (
          <MicIcon className="mr-2 h-5 w-5" />
        )}
        {status === "error_retry" && <RefreshIcon className="mr-2 h-4 w-4" />}
        {isConnecting && <Spinner className="mr-2 h-4 w-4" />}
        {isActive && <StopIcon className="mr-2 h-4 w-4" />}

        <span>{label}</span>
      </button>

      <p className="text-[11px] sm:text-xs text-rizz-mute">
        {status === "fallback_text"
          ? "Voice is offline. Type to keep chatting."
          : isActive
            ? "Tap again to end."
            : "Tap and speak naturally. Rizzy hears you."}
      </p>
    </div>
  );
}

function MicIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <rect x="9" y="3" width="6" height="12" rx="3" />
      <path d="M5 11a7 7 0 0 0 14 0" />
      <path d="M12 18v3" />
    </svg>
  );
}

function StopIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden>
      <rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor" />
    </svg>
  );
}

function RefreshIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <path d="M3 12a9 9 0 0 1 15.5-6.4L21 8" />
      <path d="M21 3v5h-5" />
      <path d="M21 12a9 9 0 0 1-15.5 6.4L3 16" />
      <path d="M3 21v-5h5" />
    </svg>
  );
}

function Spinner({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={`animate-spin ${className ?? ""}`} aria-hidden>
      <circle
        cx="12"
        cy="12"
        r="9"
        stroke="currentColor"
        strokeOpacity="0.25"
        strokeWidth="3"
        fill="none"
      />
      <path
        d="M21 12a9 9 0 0 0-9-9"
        stroke="currentColor"
        strokeWidth="3"
        fill="none"
        strokeLinecap="round"
      />
    </svg>
  );
}
