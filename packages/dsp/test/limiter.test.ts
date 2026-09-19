import { describe, it, expect } from "vitest";
import { Limiter } from "../src/kernels/limiter.js";
import { SR, sine, peak } from "./helpers.js";

describe("Limiter", () => {
  it("leaves quiet material untouched", () => {
    const lim = new Limiter(SR);
    const l = sine(440, 4096, SR, 0.3);
    const r = sine(440, 4096, SR, 0.3);
    const before = Float32Array.from(l);
    lim.process(l, r, l.length);
    expect(peak(l)).toBeCloseTo(peak(before), 3);
  });

  it("never lets a sample past the ceiling", () => {
    const lim = new Limiter(SR, 0.99);
    const l = sine(100, SR, SR, 4);
    const r = sine(100, SR, SR, 4);
    lim.process(l, r, l.length);
    expect(peak(l)).toBeLessThanOrEqual(0.99 + 1e-6);
    expect(peak(r)).toBeLessThanOrEqual(0.99 + 1e-6);
  });

  it("holds the ceiling against a step into heavy overdrive", () => {
    const lim = new Limiter(SR, 0.99);
    const l = new Float32Array(SR).fill(0);
    const r = new Float32Array(SR).fill(0);
    for (let i = 1000; i < l.length; i++) {
      l[i] = 3;
      r[i] = 3;
    }
    lim.process(l, r, l.length);
    expect(peak(l)).toBeLessThanOrEqual(0.99 + 1e-6);
    expect(lim.reduction).toBeLessThan(0.5);
  });

  it("preserves the stereo image by detecting on the louder channel", () => {
    const lim = new Limiter(SR, 0.99);
    const l = sine(440, 8192, SR, 2);
    const r = sine(440, 8192, SR, 1);
    lim.process(l, r, l.length);
    // Measured once the gain has settled. With no lookahead the first few
    // milliseconds pass through to the hard ceiling, which is the tradeoff
    // taken deliberately in Limiter: latency costs more than that transient.
    const settledL = peak(l.subarray(l.length >> 1));
    const settledR = peak(r.subarray(r.length >> 1));
    // Both sides took the same gain reduction, so their ratio is unchanged.
    expect(settledL / settledR).toBeCloseTo(2, 1);
  });

  it("releases back toward unity once the signal drops", () => {
    const lim = new Limiter(SR);
    const loudL = sine(440, 4096, SR, 4);
    const loudR = sine(440, 4096, SR, 4);
    lim.process(loudL, loudR, loudL.length);
    expect(lim.reduction).toBeLessThan(0.5);
    const quiet = new Float32Array(SR);
    lim.process(quiet, new Float32Array(SR), SR);
    expect(lim.reduction).toBeGreaterThan(0.95);
  });

  it("clears on reset", () => {
    const lim = new Limiter(SR);
    lim.process(sine(440, 2048, SR, 5), sine(440, 2048, SR, 5), 2048);
    lim.reset();
    expect(lim.reduction).toBe(1);
  });
});
