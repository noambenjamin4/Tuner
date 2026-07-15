export type AnalysisEngine = "essentia" | "basic";

export interface AnalysisResult {
  name: string;
  duration: number;
  sampleRate: number;
  channels: number;
  bitDepthLabel: string;
  fileSize: number;
  bpm: number;
  bpmAlternate: number | null;
  key: string;
  scale: string;
  camelot: string;
  confidence: number;
  energy: number | null;
  danceability: number | null;
  loudness: number | null;
  engine: AnalysisEngine;
  analyzedAt: string;
}

export interface HistoryEntry {
  name: string;
  duration: string;
  bpm: number;
  key: string;
  scale: string;
  confidence: number;
  analyzedAt: string;
  energy?: number | null;
  danceability?: number | null;
  loudness?: number | null;
}

export interface WorkerRequest {
  id: number;
  /** 16 kHz mono. Drives the KEY detector, which measured BETTER at 16k than
   *  at 44.1k (47% vs 45% exact on a 49-song truth set). */
  samples: Float32Array;
  sampleRate: number;
  /** The track at its ORIGINAL rate, for the tempo estimator only.
   *  PercivalBpmEstimator's frame/hop defaults (1024/2048/128/128) are
   *  specified for 44.1 kHz; feeding them 16 kHz stretches every window ~2.76x
   *  in TIME, which measurably costs accuracy on EVERY band (see
   *  scripts/rate-experiment.mjs: 61% -> 64% exact, slow 70% -> 74%, fast
   *  10% -> 14%). Optional so a caller that only has 16 kHz still works. */
  bpmSamples?: Float32Array;
  bpmSampleRate?: number;
}

export interface WorkerResponse {
  id: number;
  engine: AnalysisEngine;
  bpm: number;
  bpmAlternate: number | null;
  bpmConfidence: number;
  key: string;
  scale: string;
  keyConfidence: number;
  energy: number | null;
  danceability: number | null;
  loudness: number | null;
}

export type YtJobStatus = "starting" | "downloading" | "converting" | "done" | "error";

export type YtFormat = "mp3" | "wav" | "m4a" | "opus" | "mp4";

export interface YtJobPublic {
  status: YtJobStatus;
  progress: number;
  title: string | null;
  error?: string;
}
