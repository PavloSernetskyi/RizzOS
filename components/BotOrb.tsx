import type { RizzyStatus } from "@/types/conversation";
import type { Personality } from "@/types/personality";

interface BotOrbProps {
  status: RizzyStatus;
  personality: Personality;
}

/**
 * Rizzy's animated presence.
 *
 * Visual states:
 *   idle           — slow float + soft breathing pulse
 *   listening      — stronger pulse + faster ring rotation
 *   processing     — slow counter-rotating orbits, dimmer core (thinking)
 *   speaking       — bright bursty scaling + equalizer bars
 *   error_retry    — pulsing red glow
 *   fallback_text  — calm, dimmed, no rotation
 */
export function BotOrb({ status, personality }: BotOrbProps) {
  const coreClass =
    status === "error_retry"
      ? "orb-core-hot"
      : personality.key === "savage"
        ? "orb-core-hot"
        : personality.key === "playful"
          ? "orb-core-cool"
          : "orb-core";

  const pulseClass =
    status === "listening"
      ? "animate-pulseStrong"
      : status === "speaking"
        ? "animate-speak"
        : status === "processing"
          ? "animate-pulseSoft opacity-80"
          : status === "error_retry"
            ? "animate-pulseStrong"
            : status === "fallback_text"
              ? "opacity-60"
              : "animate-pulseSoft";

  const floatClass =
    status === "processing" || status === "fallback_text" ? "" : "animate-float";

  const ringOuterSpeed =
    status === "listening" || status === "speaking"
      ? "animate-orbit"
      : status === "fallback_text"
        ? ""
        : "animate-orbit [animation-duration:28s]";
  const ringInnerSpeed =
    status === "processing"
      ? "animate-orbit-rev [animation-duration:10s]"
      : status === "fallback_text"
        ? ""
        : "animate-orbit-rev";

  return (
    <div
      className={`relative grid place-items-center ${floatClass}`}
      aria-hidden
    >
      <div
        className={`absolute inset-0 -m-16 rounded-full blur-3xl opacity-60 ${personality.accent.shadow}`}
        style={{
          background:
            status === "error_retry"
              ? "radial-gradient(closest-side, rgba(255,92,138,0.5), transparent 70%)"
              : personality.key === "savage"
                ? "radial-gradient(closest-side, rgba(255,92,138,0.45), transparent 70%)"
                : personality.key === "playful"
                  ? "radial-gradient(closest-side, rgba(57,208,216,0.45), transparent 70%)"
                  : "radial-gradient(closest-side, rgba(124,92,255,0.5), transparent 70%)",
        }}
      />

      <div
        className={`absolute rounded-full ${ringOuterSpeed}`}
        style={{
          width: "min(78vw, 360px)",
          height: "min(78vw, 360px)",
          border: "1px dashed rgba(179,136,255,0.25)",
        }}
      />

      <div
        className={`absolute rounded-full ${ringInnerSpeed}`}
        style={{
          width: "min(62vw, 280px)",
          height: "min(62vw, 280px)",
          border: "1px solid rgba(255,255,255,0.06)",
          boxShadow:
            "inset 0 0 40px rgba(124,92,255,0.15), 0 0 40px rgba(124,92,255,0.1)",
        }}
      />

      <div
        className={`relative rounded-full ${coreClass} animate-shimmer ${pulseClass}`}
        style={{
          width: "min(52vw, 220px)",
          height: "min(52vw, 220px)",
          boxShadow:
            personality.key === "savage" || status === "error_retry"
              ? "0 0 60px rgba(255,92,138,0.5), inset 0 0 40px rgba(255,255,255,0.15)"
              : personality.key === "playful"
                ? "0 0 60px rgba(57,208,216,0.5), inset 0 0 40px rgba(255,255,255,0.15)"
                : "0 0 60px rgba(124,92,255,0.55), inset 0 0 40px rgba(255,255,255,0.15)",
        }}
      >
        <div className="absolute inset-0 rounded-full orb-grain" />
        <div className="absolute inset-[18%] rounded-full bg-[#0a0b14]/70 backdrop-blur-sm" />

        {status === "speaking" && (
          <div className="absolute inset-0 grid place-items-center">
            <div className="flex items-end gap-1 h-10">
              <span className="bar h-full" />
              <span className="bar h-full" />
              <span className="bar h-full" />
              <span className="bar h-full" />
              <span className="bar h-full" />
            </div>
          </div>
        )}

        {status === "processing" && (
          <div className="absolute inset-0 grid place-items-center">
            <div className="flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-white/70 animate-pulseSoft" />
              <span className="h-1.5 w-1.5 rounded-full bg-white/70 animate-pulseSoft [animation-delay:120ms]" />
              <span className="h-1.5 w-1.5 rounded-full bg-white/70 animate-pulseSoft [animation-delay:240ms]" />
            </div>
          </div>
        )}

        {status === "listening" && (
          <div className="absolute inset-[5%] rounded-full ring-2 ring-white/20" />
        )}
      </div>
    </div>
  );
}
