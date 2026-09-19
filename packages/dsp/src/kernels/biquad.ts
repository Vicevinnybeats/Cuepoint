/**
 * RBJ cookbook biquad, transposed direct form II.
 *
 * Audio-thread safe: all state lives in fields allocated at construction.
 * `process` mutates the supplied block in place and allocates nothing.
 */

export type BiquadKind =
  | "lowpass"
  | "highpass"
  | "peaking"
  | "lowshelf"
  | "highshelf"
  | "bypass";

export interface BiquadCoefficients {
  b0: number;
  b1: number;
  b2: number;
  a1: number;
  a2: number;
}

/** Smallest Q we accept; below this the cookbook formulas blow up. */
const MIN_Q = 1e-4;

export class Biquad {
  b0 = 1;
  b1 = 0;
  b2 = 0;
  a1 = 0;
  a2 = 0;

  // Transposed DF-II state.
  private z1 = 0;
  private z2 = 0;

  constructor(readonly sampleRate: number) {}

  reset(): void {
    this.z1 = 0;
    this.z2 = 0;
  }

  setBypass(): void {
    this.b0 = 1;
    this.b1 = 0;
    this.b2 = 0;
    this.a1 = 0;
    this.a2 = 0;
  }

  /**
   * @param gainDb only used by `peaking`, `lowshelf`, `highshelf`.
   */
  set(kind: BiquadKind, frequency: number, q: number, gainDb = 0): void {
    if (kind === "bypass") {
      this.setBypass();
      return;
    }

    const nyquist = this.sampleRate * 0.5;
    // Clamp well inside the Nyquist limit: cos(w0) -> -1 is numerically nasty.
    const f = Math.min(Math.max(frequency, 1), nyquist * 0.999);
    const qq = Math.max(q, MIN_Q);

    const w0 = (2 * Math.PI * f) / this.sampleRate;
    const cos0 = Math.cos(w0);
    const sin0 = Math.sin(w0);
    const alpha = sin0 / (2 * qq);

    let b0 = 1;
    let b1 = 0;
    let b2 = 0;
    let a0 = 1;
    let a1 = 0;
    let a2 = 0;

    switch (kind) {
      case "lowpass": {
        b0 = (1 - cos0) / 2;
        b1 = 1 - cos0;
        b2 = b0;
        a0 = 1 + alpha;
        a1 = -2 * cos0;
        a2 = 1 - alpha;
        break;
      }
      case "highpass": {
        b0 = (1 + cos0) / 2;
        b1 = -(1 + cos0);
        b2 = b0;
        a0 = 1 + alpha;
        a1 = -2 * cos0;
        a2 = 1 - alpha;
        break;
      }
      case "peaking": {
        const A = Math.pow(10, gainDb / 40);
        b0 = 1 + alpha * A;
        b1 = -2 * cos0;
        b2 = 1 - alpha * A;
        a0 = 1 + alpha / A;
        a1 = -2 * cos0;
        a2 = 1 - alpha / A;
        break;
      }
      case "lowshelf": {
        const A = Math.pow(10, gainDb / 40);
        const twoSqrtAAlpha = 2 * Math.sqrt(A) * alpha;
        b0 = A * (A + 1 - (A - 1) * cos0 + twoSqrtAAlpha);
        b1 = 2 * A * (A - 1 - (A + 1) * cos0);
        b2 = A * (A + 1 - (A - 1) * cos0 - twoSqrtAAlpha);
        a0 = A + 1 + (A - 1) * cos0 + twoSqrtAAlpha;
        a1 = -2 * (A - 1 + (A + 1) * cos0);
        a2 = A + 1 + (A - 1) * cos0 - twoSqrtAAlpha;
        break;
      }
      case "highshelf": {
        const A = Math.pow(10, gainDb / 40);
        const twoSqrtAAlpha = 2 * Math.sqrt(A) * alpha;
        b0 = A * (A + 1 + (A - 1) * cos0 + twoSqrtAAlpha);
        b1 = -2 * A * (A - 1 + (A + 1) * cos0);
        b2 = A * (A + 1 + (A - 1) * cos0 - twoSqrtAAlpha);
        a0 = A + 1 - (A - 1) * cos0 + twoSqrtAAlpha;
        a1 = 2 * (A - 1 - (A + 1) * cos0);
        a2 = A + 1 - (A - 1) * cos0 - twoSqrtAAlpha;
        break;
      }
    }

    const inv = 1 / a0;
    this.b0 = b0 * inv;
    this.b1 = b1 * inv;
    this.b2 = b2 * inv;
    this.a1 = a1 * inv;
    this.a2 = a2 * inv;
  }

  /** Single-sample tick. Kept separate so `process` stays branch-free. */
  tick(x: number): number {
    const y = this.b0 * x + this.z1;
    this.z1 = this.b1 * x - this.a1 * y + this.z2;
    this.z2 = this.b2 * x - this.a2 * y;
    return y;
  }

  /** In-place block processing. Allocation-free. */
  process(block: Float32Array, frames: number): void {
    const { b0, b1, b2, a1, a2 } = this;
    let z1 = this.z1;
    let z2 = this.z2;
    for (let i = 0; i < frames; i++) {
      const x = block[i] as number;
      const y = b0 * x + z1;
      z1 = b1 * x - a1 * y + z2;
      z2 = b2 * x - a2 * y;
      block[i] = y;
    }
    this.z1 = z1;
    this.z2 = z2;
  }

  coefficients(): BiquadCoefficients {
    return { b0: this.b0, b1: this.b1, b2: this.b2, a1: this.a1, a2: this.a2 };
  }
}

/**
 * Magnitude of the transfer function at `frequency`, in linear gain.
 * Used by the offline render tests to assert a filter actually does what its
 * name says, independent of the time-domain implementation.
 */
export function magnitudeAt(
  c: BiquadCoefficients,
  frequency: number,
  sampleRate: number,
): number {
  const w = (2 * Math.PI * frequency) / sampleRate;
  const cos1 = Math.cos(-w);
  const sin1 = Math.sin(-w);
  const cos2 = Math.cos(-2 * w);
  const sin2 = Math.sin(-2 * w);

  const numRe = c.b0 + c.b1 * cos1 + c.b2 * cos2;
  const numIm = c.b1 * sin1 + c.b2 * sin2;
  const denRe = 1 + c.a1 * cos1 + c.a2 * cos2;
  const denIm = c.a1 * sin1 + c.a2 * sin2;

  return Math.hypot(numRe, numIm) / Math.hypot(denRe, denIm);
}
