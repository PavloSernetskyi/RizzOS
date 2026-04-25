import type { LatencyEvent, LatencyTurn } from "@/types/latency";

const DEBUG =
  typeof process !== "undefined" &&
  process.env?.NEXT_PUBLIC_RIZZ_DEBUG === "1";

function uid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function now(): number {
  return typeof performance !== "undefined"
    ? performance.now()
    : Date.now();
}

/**
 * Lightweight, single-turn latency tracker. Each turn (user speaks → Rizzy
 * speaks → done) gets one tracker. Mark events as they happen, then call
 * `finalize()` to compute durations.
 *
 * Intentionally tiny. No external deps, no observable graph, no overhead.
 */
export class TurnTimer {
  private data: LatencyTurn;

  constructor() {
    this.data = { id: uid() };
  }

  mark(event: LatencyEvent): void {
    if (this.data[event] !== undefined) return; // first-write wins
    this.data[event] = now();
  }

  /** Compute derived durations and return the snapshot. */
  finalize(): LatencyTurn {
    const d = this.data;

    if (d.transcriptReceivedAt && d.speechEndedAt) {
      d.sttLatencyMs = round(d.transcriptReceivedAt - d.speechEndedAt);
    }
    if (d.llmFirstTokenAt && d.llmRequestStartedAt) {
      d.llmLatencyMs = round(d.llmFirstTokenAt - d.llmRequestStartedAt);
    }
    if (d.firstAudioAt && d.ttsRequestedAt) {
      d.ttsLatencyMs = round(d.firstAudioAt - d.ttsRequestedAt);
    }
    if (d.firstAudioAt && d.speechEndedAt) {
      d.firstSoundLatencyMs = round(d.firstAudioAt - d.speechEndedAt);
    }
    if (d.audioCompletedAt && d.speechEndedAt) {
      d.totalTurnLatencyMs = round(d.audioCompletedAt - d.speechEndedAt);
    }

    if (DEBUG) {
      // eslint-disable-next-line no-console
      console.groupCollapsed(
        `🎯 turn ${d.id.slice(0, 6)} — first sound ${d.firstSoundLatencyMs ?? "?"}ms`,
      );
      // eslint-disable-next-line no-console
      console.table({
        STT: d.sttLatencyMs,
        "LLM (first token)": d.llmLatencyMs,
        "TTS (first audio)": d.ttsLatencyMs,
        "Mouth-to-ear": d.firstSoundLatencyMs,
        "Total turn": d.totalTurnLatencyMs,
      });
      // eslint-disable-next-line no-console
      console.groupEnd();
    }

    return { ...d };
  }
}

function round(n: number): number {
  return Math.round(n);
}
