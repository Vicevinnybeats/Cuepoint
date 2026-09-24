/**
 * Drop-in for kernels/eq3.ts's Eq3, running the per-sample loop in WASM
 * (src/wasm/eq3.wat). Coefficients and gain targets are still computed in
 * JS — they only change at control rate — and written into the state block.
 */
import { Biquad } from "../kernels/biquad.js";
import { EQ_LOW_HZ, EQ_HIGH_HZ, EQ_GAIN_SMOOTHING_MS, knobToGain } from "../kernels/eq3.js";
import type { WasmDsp } from "./wasm-dsp.js";

const SECTIONS = 8;
const SECTION_F64 = 7; // b0 b1 b2 a1 a2 z1 z2
const SMOOTHER_BASE = SECTIONS * SECTION_F64; // f64 index 56 = byte 448
const STATE_F64 = SMOOTHER_BASE + 3 * 3; // + 3 smoothers of [current target coeff]
const LOW_GAIN = 0;
const MID_GAIN = 1;
const HIGH_GAIN = 2;

// Section order must match the byte offsets in eq3.wat.
const LAYOUT: Array<[kind: "lowpass" | "highpass", hz: number]> = [
  ["lowpass", EQ_LOW_HZ], // lowA
  ["lowpass", EQ_LOW_HZ], // lowB
  ["highpass", EQ_LOW_HZ], // midHpA
  ["highpass", EQ_LOW_HZ], // midHpB
  ["lowpass", EQ_HIGH_HZ], // midLpA
  ["lowpass", EQ_HIGH_HZ], // midLpB
  ["highpass", EQ_HIGH_HZ], // highA
  ["highpass", EQ_HIGH_HZ], // highB
];

export class WasmEq3 {
  private readonly statePtr: number;
  private readonly state: Float64Array;
  /** Fallback scratch for blocks that don't live in WASM memory. */
  private scratch: Float32Array | null = null;

  private lowKnob = 0.5;
  private midKnob = 0.5;
  private highKnob = 0.5;

  constructor(
    readonly sampleRate: number,
    private readonly dsp: WasmDsp,
  ) {
    this.statePtr = dsp.alloc(STATE_F64 * 8);
    this.state = dsp.f64View(this.statePtr, STATE_F64);
    this.state.fill(0);

    const coeffs = new Biquad(sampleRate);
    LAYOUT.forEach(([kind, hz], section) => {
      coeffs.set(kind, hz, Math.SQRT1_2);
      const base = section * SECTION_F64;
      this.state[base] = coeffs.b0;
      this.state[base + 1] = coeffs.b1;
      this.state[base + 2] = coeffs.b2;
      this.state[base + 3] = coeffs.a1;
      this.state[base + 4] = coeffs.a2;
    });

    // Same formula as SmoothedValue.setTimeConstant.
    const samples = Math.max((EQ_GAIN_SMOOTHING_MS / 1000) * sampleRate, 1);
    const coeff = Math.exp(-1 / samples);
    for (const smoother of [LOW_GAIN, MID_GAIN, HIGH_GAIN]) {
      const base = SMOOTHER_BASE + smoother * 3;
      this.state[base] = 1; // current
      this.state[base + 1] = 1; // target
      this.state[base + 2] = coeff;
    }
  }

  reset(): void {
    for (let section = 0; section < SECTIONS; section++) {
      const base = section * SECTION_F64;
      this.state[base + 5] = 0;
      this.state[base + 6] = 0;
    }
  }

  private setTarget(smoother: number, knob: number): void {
    this.state[SMOOTHER_BASE + smoother * 3 + 1] = knobToGain(knob);
  }

  setLow(knob: number): void {
    this.lowKnob = knob;
    this.setTarget(LOW_GAIN, knob);
  }

  setMid(knob: number): void {
    this.midKnob = knob;
    this.setTarget(MID_GAIN, knob);
  }

  setHigh(knob: number): void {
    this.highKnob = knob;
    this.setTarget(HIGH_GAIN, knob);
  }

  knobs(): { low: number; mid: number; high: number } {
    return { low: this.lowKnob, mid: this.midKnob, high: this.highKnob };
  }

  /** In place. Zero-copy when `block` was allocated from the same WasmDsp. */
  process(block: Float32Array, frames: number): void {
    if (this.dsp.isInMemory(block)) {
      this.dsp.exports.eq3_process(this.statePtr, block.byteOffset, frames);
      return;
    }
    // Off-heap block (tests, or a caller that didn't allocate from the
    // WasmDsp): copy through a scratch region. Allocated once, lazily.
    if (!this.scratch || this.scratch.length < frames) this.scratch = this.dsp.allocF32(frames);
    this.scratch.set(block.subarray(0, frames));
    this.dsp.exports.eq3_process(this.statePtr, this.scratch.byteOffset, frames);
    block.set(this.scratch.subarray(0, frames));
  }
}
