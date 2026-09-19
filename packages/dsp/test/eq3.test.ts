import { describe, it, expect } from "vitest";
import { Eq3, knobToDb } from "../src/kernels/eq3.js";
import { SR, measureGain, expectGainCloseDb, sine, settledRms } from "./helpers.js";

describe("knobToDb", () => {
  it("maps centre to unity and the ends to the mixer's range", () => {
    expect(knobToDb(0.5)).toBe(0);
    expect(knobToDb(1)).toBeCloseTo(6, 6);
    expect(knobToDb(0)).toBeCloseTo(-26, 6);
  });

  it("clamps out-of-range knob positions", () => {
    expect(knobToDb(-3)).toBeCloseTo(-26, 6);
    expect(knobToDb(9)).toBeCloseTo(6, 6);
  });
});

describe("Eq3", () => {
  it("is transparent with every band at centre", () => {
    const eq = new Eq3(SR);
    for (const hz of [60, 400, 2000, 10000]) {
      const g = measureGain(hz, (b, n) => {
        eq.reset();
        eq.process(b, n);
      });
      expectGainCloseDb(g, 1, 0.2);
    }
  });

  it("kills the low band to silence, not merely attenuation", () => {
    const eq = new Eq3(SR);
    eq.setLow(0);
    const block = sine(60, SR);
    eq.process(block, block.length);
    // What leaks is the crossover residual the mid band still carries at
    // 60 Hz. A DJM-900's low kill measures around -26 dB; anything past -35 dB
    // is already beyond what the hardware does.
    expect(20 * Math.log10(Math.max(settledRms(block), 1e-12))).toBeLessThan(-35);
  });

  it("leaves the high band intact while the low band is killed", () => {
    const eq = new Eq3(SR);
    eq.setLow(0);
    const g = measureGain(10000, (b, n) => eq.process(b, n));
    expectGainCloseDb(g, 1, 1.0);
  });

  it("boosts and cuts each band in the right direction", () => {
    const probes: Array<[number, (eq: Eq3, k: number) => void]> = [
      [60, (eq, k) => eq.setLow(k)],
      [1000, (eq, k) => eq.setMid(k)],
      [10000, (eq, k) => eq.setHigh(k)],
    ];
    for (const [hz, setBand] of probes) {
      const boosted = new Eq3(SR);
      setBand(boosted, 1);
      const boostGain = measureGain(hz, (b, n) => boosted.process(b, n));

      const cut = new Eq3(SR);
      setBand(cut, 0.25);
      const cutGain = measureGain(hz, (b, n) => cut.process(b, n));

      expect(boostGain).toBeGreaterThan(1.2);
      expect(cutGain).toBeLessThan(0.85);
    }
  });

  it("reports its knob positions for UI readback", () => {
    const eq = new Eq3(SR);
    eq.setLow(0.1);
    eq.setMid(0.9);
    expect(eq.knobs()).toEqual({ low: 0.1, mid: 0.9, high: 0.5 });
  });

  it("does not click when a band is killed mid-block", () => {
    const eq = new Eq3(SR);
    const block = sine(60, 4096);
    eq.process(block, 2048);
    eq.setLow(0);
    eq.process(block.subarray(2048), 2048);
    // A 5 ms kill envelope must not produce a sample-to-sample jump.
    for (let i = 2049; i < block.length; i++) {
      const jump = Math.abs((block[i] as number) - (block[i - 1] as number));
      expect(jump).toBeLessThan(0.2);
    }
  });
});
