import { describe, it, expect } from "vitest";
import { FilterKnob } from "../src/kernels/filter-knob.js";
import { SR, measureGain, expectGainCloseDb, sine } from "./helpers.js";

describe("FilterKnob", () => {
  it("is bypassed in the centre dead zone", () => {
    const f = new FilterKnob(SR);
    f.set(0.01);
    expect(f.isActive).toBe(false);
    const block = sine(1000, 512);
    const before = Float32Array.from(block);
    f.process(block, block.length);
    expect(block[100]).toBeCloseTo(before[100] as number, 6);
  });

  it("sweeps a lowpass when turned left", () => {
    const f = new FilterKnob(SR);
    f.set(-0.8);
    expect(f.isActive).toBe(true);
    const lowGain = measureGain(80, (b, n) => f.process(b, n));
    const highGain = measureGain(10000, (b, n) => f.process(b, n));
    expect(lowGain).toBeGreaterThan(highGain * 10);
  });

  it("sweeps a highpass when turned right", () => {
    const f = new FilterKnob(SR);
    f.set(0.8);
    const lowGain = measureGain(80, (b, n) => f.process(b, n));
    const highGain = measureGain(10000, (b, n) => f.process(b, n));
    expect(highGain).toBeGreaterThan(lowGain * 10);
  });

  it("matches its analytic magnitude under offline render", () => {
    for (const pos of [-0.9, -0.5, 0.5, 0.9]) {
      const f = new FilterKnob(SR);
      f.set(pos);
      for (const hz of [100, 1000, 6000]) {
        const expected = f.magnitudeAt(hz);
        const actual = measureGain(hz, (b, n) => {
          f.reset();
          f.process(b, n);
        });
        expectGainCloseDb(actual, expected, 0.6);
      }
    }
  });

  it("clamps positions beyond the knob's travel", () => {
    const f = new FilterKnob(SR);
    f.set(-5);
    expect(f.value).toBe(-1);
    f.set(5);
    expect(f.value).toBe(1);
  });

  it("drops its tail when returning to centre", () => {
    const f = new FilterKnob(SR);
    f.set(-0.9);
    const loud = sine(100, 4096);
    f.process(loud, loud.length);
    f.set(0);
    const silence = new Float32Array(512);
    f.process(silence, silence.length);
    expect(Math.max(...silence)).toBe(0);
  });
});
