/**
 * Offline tempo detection: energy-envelope autocorrelation.
 *
 * Not full beat tracking (no phase/downbeat), but the same building block
 * every simple tempo detector uses: track the short-time energy, emphasise
 * onsets, then find the periodicity that best explains them. Runs inside a
 * Web Worker (see worker.ts) so it never blocks the main thread.
 */

export interface BpmDetectionOptions {
  minBpm?: number;
  maxBpm?: number;
  /** Envelope frame size in samples. Smaller is more precise, slower. */
  hop?: number;
}

const DEFAULT_MIN_BPM = 70;
const DEFAULT_MAX_BPM = 180;
const DEFAULT_HOP = 512;

/** RMS energy per `hop`-sample frame. */
export function computeEnvelope(samples: Float32Array, hop: number): Float32Array {
  const frames = Math.floor(samples.length / hop);
  const envelope = new Float32Array(frames);
  for (let i = 0; i < frames; i++) {
    const start = i * hop;
    const end = Math.min(start + hop, samples.length);
    let sum = 0;
    for (let j = start; j < end; j++) {
      const v = samples[j] as number;
      sum += v * v;
    }
    envelope[i] = Math.sqrt(sum / (end - start));
  }
  return envelope;
}

/** Half-wave rectified first difference: rising energy only, i.e. onsets. */
function onsetsFromEnvelope(envelope: Float32Array): Float32Array {
  const onset = new Float32Array(envelope.length);
  for (let i = 1; i < envelope.length; i++) {
    const delta = (envelope[i] as number) - (envelope[i - 1] as number);
    onset[i] = delta > 0 ? delta : 0;
  }
  return onset;
}

function autocorrelationAt(onset: Float32Array, lag: number): number {
  let score = 0;
  for (let i = lag; i < onset.length; i++) {
    score += (onset[i] as number) * (onset[i - lag] as number);
  }
  return score;
}

/** Fold octave errors (autocorrelation often locks onto 2x or 0.5x tempo). */
function foldToRange(bpm: number, min: number, max: number): number {
  let b = bpm;
  while (b < min) b *= 2;
  while (b > max) b /= 2;
  return b;
}

export function detectBpm(samples: Float32Array, sampleRate: number, options: BpmDetectionOptions = {}): number {
  const hop = options.hop ?? DEFAULT_HOP;
  const minBpm = options.minBpm ?? DEFAULT_MIN_BPM;
  const maxBpm = options.maxBpm ?? DEFAULT_MAX_BPM;
  const frameRate = sampleRate / hop;

  const onset = onsetsFromEnvelope(computeEnvelope(samples, hop));
  const minLag = Math.max(1, Math.floor((60 / maxBpm) * frameRate));
  const maxLag = Math.min(onset.length - 1, Math.ceil((60 / minBpm) * frameRate));
  if (maxLag <= minLag) return minBpm;

  let bestLag = minLag;
  let bestScore = -Infinity;
  for (let lag = minLag; lag <= maxLag; lag++) {
    const score = autocorrelationAt(onset, lag);
    if (score > bestScore) {
      bestScore = score;
      bestLag = lag;
    }
  }

  // Parabolic interpolation around the best integer lag for sub-frame
  // precision — otherwise resolution is limited to whole envelope frames,
  // which near 128 BPM is a few BPM per lag step.
  const lagFloor = Math.max(minLag, bestLag - 1);
  const lagCeil = Math.min(maxLag, bestLag + 1);
  const s0 = autocorrelationAt(onset, lagFloor);
  const s1 = bestScore;
  const s2 = autocorrelationAt(onset, lagCeil);
  const denom = s0 - 2 * s1 + s2;
  const refinement = denom !== 0 ? 0.5 * (s0 - s2) / denom : 0;
  const refinedLag = bestLag + Math.max(-1, Math.min(1, refinement));

  const bpm = (60 * frameRate) / refinedLag;
  return foldToRange(bpm, minBpm, maxBpm);
}
