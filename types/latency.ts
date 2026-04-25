/**
 * Per-turn latency snapshot. Every field is a `performance.now()` timestamp
 * (ms) or a derived duration. Used by the orchestrator to surface where
 * time is being spent during a Rizzy turn.
 */
export interface LatencyTurn {
  /** Stable id for the turn, used to correlate logs. */
  id: string;

  // Timestamps (high-resolution monotonic clock)
  speechStartedAt?: number;
  speechEndedAt?: number;
  transcriptReceivedAt?: number;
  llmRequestStartedAt?: number;
  llmFirstTokenAt?: number;
  llmCompletedAt?: number;
  ttsRequestedAt?: number;
  firstAudioAt?: number;
  audioCompletedAt?: number;

  // Derived (filled when finalize() runs)
  sttLatencyMs?: number;
  llmLatencyMs?: number;
  ttsLatencyMs?: number;
  firstSoundLatencyMs?: number;
  totalTurnLatencyMs?: number;
}

export type LatencyEvent =
  | "speechStartedAt"
  | "speechEndedAt"
  | "transcriptReceivedAt"
  | "llmRequestStartedAt"
  | "llmFirstTokenAt"
  | "llmCompletedAt"
  | "ttsRequestedAt"
  | "firstAudioAt"
  | "audioCompletedAt";
