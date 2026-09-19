import { describe, it, expect } from "vitest";
import { Meter, linearToDb, dbToLinear } from "../src/kernels/meter.js";
import { SR, sine } from "./helpers.js";

describe("dB conversion", () => {
  it("round-trips", () => {
    for (const db of [-40, -12, -6, 0]) {
      expect(linearToDb(dbToLinear(db))).toBeCloseTo(db, 6);
    }
  });

  it("reports silence as -Infinity", () => {
    expect(linearToDb(0)).toBe(-Infinity);
  });
});

describe("Meter", () => {
  it("tracks peak of a full-scale sine", () => {
    const m = new Meter(SR);
    const block = sine(1000, SR, SR, 0.5);
    m.process(block, block.length);
    expect(m.peak).toBeCloseTo(0.5, 2);
  });

  it("reports the RMS of a sine as peak/sqrt(2)", () => {
    const m = new Meter(SR, 100);
    const block = sine(1000, SR, SR, 1);
    m.process(block, block.length);
    expect(m.rms).toBeCloseTo(Math.SQRT1_2, 2);
  });

  it("decays peak over time rather than holding forever", () => {
    const m = new Meter(SR, 300, 20);
    m.process(sine(1000, 1024, SR, 1), 1024);
    const afterHit = m.peak;
    m.process(new Float32Array(SR), SR);
    expect(m.peak).toBeLessThan(afterHit * 0.2);
  });

  it("latches a clip indicator and holds it", () => {
    const m = new Meter(SR, 300, 20, 1000);
    const hot = new Float32Array(64).fill(1.4);
    m.process(hot, hot.length);
    expect(m.isClipping).toBe(true);
    // Still lit half a second later.
    m.process(new Float32Array(SR / 2), SR / 2);
    expect(m.isClipping).toBe(true);
    m.process(new Float32Array(SR), SR);
    expect(m.isClipping).toBe(false);
  });

  it("does not modify the block it measures", () => {
    const m = new Meter(SR);
    const block = sine(440, 256, SR, 0.3);
    const before = Float32Array.from(block);
    m.process(block, block.length);
    expect(Array.from(block)).toEqual(Array.from(before));
  });

  it("clears on reset", () => {
    const m = new Meter(SR);
    m.process(sine(1000, 4096, SR, 1), 4096);
    m.reset();
    expect(m.peak).toBe(0);
    expect(m.rms).toBe(0);
    expect(m.isClipping).toBe(false);
  });
});
