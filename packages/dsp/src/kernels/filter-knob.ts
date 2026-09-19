import { Biquad, magnitudeAt } from "./biquad.js";

/**
 * The bipolar filter knob every DJ mixer has: centre is bypass, turning left
 * sweeps a resonant lowpass down, turning right sweeps a resonant highpass up.
 *
 * Position is -1..+1 with 0 as centre. The sweep is exponential in frequency
 * because pitch perception is, and the hardware feels wrong otherwise.
 */

const DEAD_ZONE = 0.02;
const LP_MAX_HZ = 20000;
const LP_MIN_HZ = 30;
const HP_MIN_HZ = 20;
const HP_MAX_HZ = 18000;

/** Resonance rises toward the extremes, as on a club mixer. */
function resonanceFor(depth: number): number {
  return Math.SQRT1_2 + depth * depth * 4;
}

export class FilterKnob {
  private readonly filter: Biquad;
  private position = 0;
  private active = false;

  constructor(readonly sampleRate: number) {
    this.filter = new Biquad(sampleRate);
    this.filter.setBypass();
  }

  reset(): void {
    this.filter.reset();
  }

  get isActive(): boolean {
    return this.active;
  }

  get value(): number {
    return this.position;
  }

  set(position: number): void {
    const p = Math.min(Math.max(position, -1), 1);
    const wasActive = this.active;
    this.position = p;

    if (Math.abs(p) <= DEAD_ZONE) {
      this.active = false;
      this.filter.setBypass();
      // Leaving the filter clears its memory, so re-entering never dumps a
      // stale tail into the mix.
      if (wasActive) this.filter.reset();
      return;
    }

    this.active = true;
    const depth = (Math.abs(p) - DEAD_ZONE) / (1 - DEAD_ZONE);

    if (p < 0) {
      const hz = LP_MAX_HZ * Math.pow(LP_MIN_HZ / LP_MAX_HZ, depth);
      this.filter.set("lowpass", hz, resonanceFor(depth));
    } else {
      const hz = HP_MIN_HZ * Math.pow(HP_MAX_HZ / HP_MIN_HZ, depth);
      this.filter.set("highpass", hz, resonanceFor(depth));
    }
  }

  process(block: Float32Array, frames: number): void {
    if (!this.active) return;
    this.filter.process(block, frames);
  }

  magnitudeAt(frequency: number): number {
    if (!this.active) return 1;
    return magnitudeAt(this.filter.coefficients(), frequency, this.sampleRate);
  }
}
