import { Biquad, magnitudeAt } from "./biquad.js";
import { SmoothedValue } from "./smoothed.js";

/**
 * Three-band mixer EQ with full kill, matching the behaviour DJs expect from a
 * club mixer: each band goes from kill to +6 dB.
 *
 * The signal is split into bands and recombined, rather than run through a
 * chain of shelves. A shelf chain cannot kill one band — pulling a shelf to
 * -inf attenuates everything downstream of it — and a bass kill has to leave
 * the hats untouched.
 *
 * Crossovers are Linkwitz-Riley 4th order (cascaded Butterworth), and the mid
 * band is a real bandpass rather than the residual `x - low - high`. The
 * residual is cheaper but useless here: the crossover's phase lag means
 * `x - low` still carries most of the low content, so a bass kill leaks about
 * -1 dB instead of killing. LR crossovers are designed to sum flat in
 * magnitude, which keeps the EQ transparent at the centre detents.
 *
 * Knob positions are 0..1 with 0.5 as unity, the way the hardware is marked.
 */

export const EQ_LOW_HZ = 200;
export const EQ_HIGH_HZ = 4000;

const MAX_BOOST_DB = 6;
const MAX_CUT_DB = -26;
const KILL_THRESHOLD = 0.02;

/** Map a 0..1 knob to dB: 0.5 -> 0 dB, 1 -> +6 dB, 0 -> -26 dB. */
export function knobToDb(knob: number): number {
  const k = Math.min(Math.max(knob, 0), 1);
  return k >= 0.5 ? ((k - 0.5) / 0.5) * MAX_BOOST_DB : ((0.5 - k) / 0.5) * MAX_CUT_DB;
}

function knobToGain(knob: number): number {
  if (knob <= KILL_THRESHOLD) return 0;
  return Math.pow(10, knobToDb(knob) / 20);
}

export class Eq3 {
  // Two cascaded Butterworth sections per crossover = Linkwitz-Riley 4th order.
  private readonly lowA: Biquad;
  private readonly lowB: Biquad;
  private readonly midHpA: Biquad;
  private readonly midHpB: Biquad;
  private readonly midLpA: Biquad;
  private readonly midLpB: Biquad;
  private readonly highA: Biquad;
  private readonly highB: Biquad;

  private readonly lowGain: SmoothedValue;
  private readonly midGain: SmoothedValue;
  private readonly highGain: SmoothedValue;

  private lowKnob = 0.5;
  private midKnob = 0.5;
  private highKnob = 0.5;

  constructor(readonly sampleRate: number) {
    this.lowA = new Biquad(sampleRate);
    this.lowB = new Biquad(sampleRate);
    this.midHpA = new Biquad(sampleRate);
    this.midHpB = new Biquad(sampleRate);
    this.midLpA = new Biquad(sampleRate);
    this.midLpB = new Biquad(sampleRate);
    this.highA = new Biquad(sampleRate);
    this.highB = new Biquad(sampleRate);

    this.lowA.set("lowpass", EQ_LOW_HZ, Math.SQRT1_2);
    this.lowB.set("lowpass", EQ_LOW_HZ, Math.SQRT1_2);
    this.midHpA.set("highpass", EQ_LOW_HZ, Math.SQRT1_2);
    this.midHpB.set("highpass", EQ_LOW_HZ, Math.SQRT1_2);
    this.midLpA.set("lowpass", EQ_HIGH_HZ, Math.SQRT1_2);
    this.midLpB.set("lowpass", EQ_HIGH_HZ, Math.SQRT1_2);
    this.highA.set("highpass", EQ_HIGH_HZ, Math.SQRT1_2);
    this.highB.set("highpass", EQ_HIGH_HZ, Math.SQRT1_2);

    // 5 ms avoids a click on a rhythmic bass kill without smearing it.
    this.lowGain = new SmoothedValue(1, sampleRate, 5);
    this.midGain = new SmoothedValue(1, sampleRate, 5);
    this.highGain = new SmoothedValue(1, sampleRate, 5);
  }

  reset(): void {
    this.lowA.reset();
    this.lowB.reset();
    this.midHpA.reset();
    this.midHpB.reset();
    this.midLpA.reset();
    this.midLpB.reset();
    this.highA.reset();
    this.highB.reset();
  }

  setLow(knob: number): void {
    this.lowKnob = knob;
    this.lowGain.set(knobToGain(knob));
  }

  setMid(knob: number): void {
    this.midKnob = knob;
    this.midGain.set(knobToGain(knob));
  }

  setHigh(knob: number): void {
    this.highKnob = knob;
    this.highGain.set(knobToGain(knob));
  }

  knobs(): { low: number; mid: number; high: number } {
    return { low: this.lowKnob, mid: this.midKnob, high: this.highKnob };
  }

  /** In-place. Allocation-free: the band values are scalars, not buffers. */
  process(block: Float32Array, frames: number): void {
    const { lowA, lowB, midHpA, midHpB, midLpA, midLpB, highA, highB } = this;
    for (let i = 0; i < frames; i++) {
      const x = block[i] as number;
      const low = lowB.tick(lowA.tick(x));
      const mid = midLpB.tick(midLpA.tick(midHpB.tick(midHpA.tick(x))));
      const high = highB.tick(highA.tick(x));
      block[i] =
        low * this.lowGain.next() +
        mid * this.midGain.next() +
        high * this.highGain.next();
    }
  }

  /**
   * Analytic magnitude of the recombined bands at `frequency`, for offline
   * assertions. Band phases are ignored, so this is exact where one band
   * dominates and approximate across a crossover.
   */
  magnitudeAt(frequency: number): number {
    const sr = this.sampleRate;
    const lp =
      magnitudeAt(this.lowA.coefficients(), frequency, sr) *
      magnitudeAt(this.lowB.coefficients(), frequency, sr);
    const hp =
      magnitudeAt(this.highA.coefficients(), frequency, sr) *
      magnitudeAt(this.highB.coefficients(), frequency, sr);
    const mid =
      magnitudeAt(this.midHpA.coefficients(), frequency, sr) *
      magnitudeAt(this.midHpB.coefficients(), frequency, sr) *
      magnitudeAt(this.midLpA.coefficients(), frequency, sr) *
      magnitudeAt(this.midLpB.coefficients(), frequency, sr);
    return (
      lp * knobToGain(this.lowKnob) +
      mid * knobToGain(this.midKnob) +
      hp * knobToGain(this.highKnob)
    );
  }
}
