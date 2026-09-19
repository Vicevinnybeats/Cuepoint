import { SmoothedValue } from "./smoothed.js";

/**
 * Master bus limiter. Not a mastering limiter — its job is that a DJ pushing
 * gain on two decks never hands the output device a sample past full scale.
 *
 * Feed-forward peak detection with instant attack and a musical release.
 * Allocation-free; no lookahead buffer, because the extra latency costs more
 * than the sub-sample overshoot it would catch.
 */
export class Limiter {
  private gainReduction: SmoothedValue;
  private envelope = 0;
  private readonly releaseCoeff: number;

  constructor(
    readonly sampleRate: number,
    private readonly ceiling = 0.99,
    releaseMs = 80,
  ) {
    this.gainReduction = new SmoothedValue(1, sampleRate, 1);
    this.releaseCoeff = Math.exp(-1 / ((releaseMs / 1000) * sampleRate));
  }

  reset(): void {
    this.envelope = 0;
    this.gainReduction.snap(1);
  }

  /** Current gain reduction in linear terms; 1 means the limiter is idle. */
  get reduction(): number {
    return this.gainReduction.value;
  }

  /**
   * Process a stereo pair in place. Detection is on the louder channel so the
   * stereo image does not shift when one side peaks.
   */
  process(left: Float32Array, right: Float32Array, frames: number): void {
    for (let i = 0; i < frames; i++) {
      const l = left[i] as number;
      const r = right[i] as number;
      const peak = Math.max(l < 0 ? -l : l, r < 0 ? -r : r);

      // Instant attack, slow release: a peak follower, not a waveform
      // follower. Smoothing the attack over a time comparable to the signal
      // period makes the envelope track the waveform itself, and the limiter
      // then flattens every cycle onto the ceiling instead of scaling it.
      this.envelope =
        peak > this.envelope
          ? peak
          : peak + (this.envelope - peak) * this.releaseCoeff;

      const target = this.envelope > this.ceiling ? this.ceiling / this.envelope : 1;
      this.gainReduction.set(target);
      const g = this.gainReduction.next();

      // The smoother can lag a fast transient, so a hard ceiling backs it up.
      left[i] = clamp(l * g, this.ceiling);
      right[i] = clamp(r * g, this.ceiling);
    }
  }
}

function clamp(x: number, ceiling: number): number {
  if (x > ceiling) return ceiling;
  if (x < -ceiling) return -ceiling;
  return x;
}
