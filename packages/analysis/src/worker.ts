/**
 * Analysis worker entry point. Bundled standalone (see
 * apps/web/scripts/build-workers.mjs) because a Worker's global scope can't
 * resolve the relative imports a normal bundler inlines for app code.
 *
 * Key detection is not implemented (see index.ts) — this worker only answers
 * with tempo and waveform peaks.
 */
import { detectBpm } from "./bpm.js";
import { computePeaks } from "./waveform.js";
import type { AnalyzeRequest, AnalyzeResult } from "./protocol.js";

type WorkerScope = { onmessage: ((event: MessageEvent<AnalyzeRequest>) => void) | null };

(self as unknown as WorkerScope).onmessage = (event: MessageEvent<AnalyzeRequest>) => {
  const { requestId, channelData, sampleRate, waveformColumns } = event.data;
  const samples = new Float32Array(channelData);

  const bpm = detectBpm(samples, sampleRate);
  const peaks = computePeaks(samples, waveformColumns);

  const result: AnalyzeResult = { type: "result", requestId, bpm, peaks: peaks.buffer as ArrayBuffer };
  (self as unknown as Worker).postMessage(result, [peaks.buffer]);
};
