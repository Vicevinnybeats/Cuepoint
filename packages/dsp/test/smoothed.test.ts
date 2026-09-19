import { describe, it, expect } from "vitest";
import { SmoothedValue } from "../src/kernels/smoothed.js";
import { SR } from "./helpers.js";

describe("SmoothedValue", () => {
  it("starts settled at its initial value", () => {
    const v = new SmoothedValue(0.5, SR);
    expect(v.value).toBe(0.5);
    expect(v.isSettled).toBe(true);
  });

  it("approaches a new target without stepping", () => {
    const v = new SmoothedValue(0, SR, 10);
    v.set(1);
    let previous = 0;
    for (let i = 0; i < 100; i++) {
      const next = v.next();
      expect(next - previous).toBeLessThan(0.01);
      expect(next).toBeGreaterThanOrEqual(previous);
      previous = next;
    }
  });

  it("reaches ~63% of a step after one time constant", () => {
    const v = new SmoothedValue(0, SR, 10);
    v.set(1);
    for (let i = 0; i < (10 / 1000) * SR; i++) v.next();
    expect(v.value).toBeCloseTo(0.632, 2);
  });

  it("settles exactly, leaving no denormal tail", () => {
    const v = new SmoothedValue(0, SR, 1);
    v.set(1);
    for (let i = 0; i < SR; i++) v.next();
    expect(v.value).toBe(1);
    expect(v.isSettled).toBe(true);
  });

  it("snaps instantly for discontinuous events like a cue jump", () => {
    const v = new SmoothedValue(0, SR);
    v.snap(0.8);
    expect(v.value).toBe(0.8);
    expect(v.next()).toBe(0.8);
  });
});
