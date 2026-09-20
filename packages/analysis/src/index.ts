/**
 * BPM detection, waveform extraction, and key detection all run in a Web
 * Worker (worker.ts) so a long track never blocks the main thread.
 */
export { detectBpm, computeEnvelope } from "./bpm.js";
export type { BpmDetectionOptions } from "./bpm.js";
export { computePeaks } from "./waveform.js";
export { detectKey, computeChromaVector } from "./key.js";
export type { KeyDetectionResult } from "./key.js";
export type { AnalyzeRequest, AnalyzeResult } from "./protocol.js";
