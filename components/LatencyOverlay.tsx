"use client";

import type { LatencyTurn } from "@/types/latency";

interface LatencyOverlayProps {
  turn: LatencyTurn | null;
}

/**
 * Tiny dev-only overlay that surfaces the most recent turn's latency
 * breakdown. Only renders when NEXT_PUBLIC_RIZZ_DEBUG=1.
 */
export function LatencyOverlay({ turn }: LatencyOverlayProps) {
  if (process.env.NEXT_PUBLIC_RIZZ_DEBUG !== "1") return null;
  if (!turn) return null;

  const rows: Array<[string, number | undefined, string]> = [
    ["STT", turn.sttLatencyMs, "speech end → transcript"],
    ["LLM", turn.llmLatencyMs, "request → first token"],
    ["TTS", turn.ttsLatencyMs, "request → first audio"],
    ["First sound", turn.firstSoundLatencyMs, "speech end → audio out"],
    ["Total turn", turn.totalTurnLatencyMs, "end-to-end"],
  ];

  return (
    <div className="fixed bottom-3 right-3 z-50 max-w-xs text-[10px] font-mono rounded-xl border border-white/10 bg-black/60 backdrop-blur-md p-3 text-rizz-ink/80 shadow-xl">
      <div className="text-rizz-mute mb-1.5 tracking-widest">LATENCY · debug</div>
      <table className="w-full">
        <tbody>
          {rows.map(([label, ms, hint]) => (
            <tr key={label}>
              <td className="pr-3 text-rizz-mute">{label}</td>
              <td className="text-rizz-ink tabular-nums text-right">
                {ms === undefined ? "—" : `${ms}ms`}
              </td>
              <td className="pl-3 text-rizz-mute/70 text-[9px]">{hint}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
