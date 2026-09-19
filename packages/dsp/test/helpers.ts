/** Offline render helpers shared by the DSP tests. */

export const SR = 48000;

/** Render `frames` of a sine at `hz` into a fresh block. */
export function sine(hz: number, frames: number, sampleRate = SR, amp = 1): Float32Array {
  const out = new Float32Array(frames);
  const w = (2 * Math.PI * hz) / sampleRate;
  for (let i = 0; i < frames; i++) out[i] = amp * Math.sin(w * i);
  return out;
}

/** RMS of the second half of a block, so filter settling is excluded. */
export function settledRms(block: Float32Array): number {
  const start = block.length >> 1;
  let sum = 0;
  for (let i = start; i < block.length; i++) {
    const x = block[i] as number;
    sum += x * x;
  }
  return Math.sqrt(sum / (block.length - start));
}

export function peak(block: Float32Array): number {
  let p = 0;
  for (let i = 0; i < block.length; i++) {
    const a = Math.abs(block[i] as number);
    if (a > p) p = a;
  }
  return p;
}

/**
 * Measured gain a processor applies to a steady sine at `hz`, in linear terms.
 * This is the offline render check: drive the real processor, measure what
 * came out, compare against the analytic response.
 */
export function measureGain(
  hz: number,
  render: (block: Float32Array, frames: number) => void,
  frames = SR,
): number {
  const block = sine(hz, frames);
  const reference = settledRms(block);
  render(block, frames);
  return settledRms(block) / reference;
}

/** Assert two linear gains agree within `toleranceDb`. */
export function expectGainCloseDb(
  actual: number,
  expected: number,
  toleranceDb: number,
): void {
  const actualDb = 20 * Math.log10(Math.max(actual, 1e-12));
  const expectedDb = 20 * Math.log10(Math.max(expected, 1e-12));
  if (Math.abs(actualDb - expectedDb) > toleranceDb) {
    throw new Error(
      `expected ${actualDb.toFixed(2)} dB to be within ${toleranceDb} dB of ` +
        `${expectedDb.toFixed(2)} dB`,
    );
  }
}
