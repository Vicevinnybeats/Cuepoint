/**
 * Peak waveform extraction for the deck display: one peak amplitude per
 * fixed-width bucket, the same representation Traktor/VDJ draw as bars.
 */
export function computePeaks(samples: Float32Array, columns: number): Float32Array {
  const peaks = new Float32Array(columns);
  if (samples.length === 0 || columns === 0) return peaks;

  const bucketSize = samples.length / columns;
  for (let c = 0; c < columns; c++) {
    const start = Math.floor(c * bucketSize);
    const end = Math.max(start + 1, Math.floor((c + 1) * bucketSize));
    let peak = 0;
    for (let i = start; i < end && i < samples.length; i++) {
      const a = Math.abs(samples[i] as number);
      if (a > peak) peak = a;
    }
    peaks[c] = peak;
  }
  return peaks;
}
