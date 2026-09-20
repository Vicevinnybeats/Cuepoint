/**
 * BPM detection and waveform extraction run in a Web Worker (worker.ts).
 * Key detection is not implemented — apps/web still shows "--" for key.
 */
export const KEY_DETECTION_IMPLEMENTED = false;

export { detectBpm, computeEnvelope } from "./bpm.js";
export type { BpmDetectionOptions } from "./bpm.js";
export { computePeaks } from "./waveform.js";
export type { AnalyzeRequest, AnalyzeResult } from "./protocol.js";
