/**
 * Analysis worker entry point. Bundled standalone (see
 * apps/web/scripts/build-workers.mjs) because a Worker's global scope can't
 * resolve the relative imports a normal bundler inlines for app code.
 */
import { detectBpm } from "./bpm.js";
import { computePeaks } from "./waveform.js";
import { detectKey } from "./key.js";
import type { AnalyzeRequest, AnalyzeResult } from "./protocol.js";

type WorkerScope = { onmessage: ((event: MessageEvent<AnalyzeRequest>) => void) | null };

(self as unknown as WorkerScope).onmessage = (event: MessageEvent<AnalyzeRequest>) => {
  const { requestId, channelData, sampleRate, waveformColumns } = event.data;
  const samples = new Float32Array(channelData);

  const bpm = detectBpm(samples, sampleRate);
  const peaks = computePeaks(samples, waveformColumns);
  const key = detectKey(samples, sampleRate);

  const result: AnalyzeResult = {
    type: "result",
    requestId,
    bpm,
    key: key.camelot,
    peaks: peaks.buffer as ArrayBuffer,
  };
  (self as unknown as Worker).postMessage(result, [peaks.buffer]);
};
