import type { RizzyStatus } from "@/types/conversation";

interface StatusBadgeProps {
  status: RizzyStatus;
}

const COPY: Record<RizzyStatus, { label: string; dot: string }> = {
  idle: { label: "Rizzy is here", dot: "bg-rizz-mute" },
  listening: { label: "Rizzy is listening…", dot: "bg-rizz-accent" },
  thinking: { label: "Rizzy is thinking…", dot: "bg-rizz-cool" },
  speaking: { label: "Rizzy is speaking…", dot: "bg-rizz-hot" },
};

export function StatusBadge({ status }: StatusBadgeProps) {
  const { label, dot } = COPY[status];
  return (
    <div
      className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 backdrop-blur-sm"
      role="status"
      aria-live="polite"
    >
      <span className="relative flex h-2 w-2">
        <span
          className={`absolute inline-flex h-full w-full rounded-full opacity-60 animate-ping ${dot}`}
        />
        <span className={`relative inline-flex h-2 w-2 rounded-full ${dot}`} />
      </span>
      <span className="text-xs sm:text-sm text-rizz-ink/90 tracking-wide">
        {label}
      </span>
    </div>
  );
}
