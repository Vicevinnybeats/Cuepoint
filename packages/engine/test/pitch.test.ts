import { describe, it, expect } from "vitest";
import {
  pitchPercentToRate,
  rateToPitchPercent,
  clampPitchPercent,
  syncRate,
} from "../src/pitch.js";

describe("pitch helpers", () => {
  it("converts percent to rate and back", () => {
    expect(pitchPercentToRate(8)).toBeCloseTo(1.08, 10);
    expect(pitchPercentToRate(-8)).toBeCloseTo(0.92, 10);
    expect(rateToPitchPercent(1.08)).toBeCloseTo(8, 10);
  });

  it("clamps to the fader's range", () => {
    expect(clampPitchPercent(50)).toBe(8);
    expect(clampPitchPercent(-50)).toBe(-8);
    expect(clampPitchPercent(3)).toBe(3);
  });

  it("computes the rate that matches a target BPM", () => {
    expect(syncRate(130, 130, 1)).toBeCloseTo(1, 10);
    expect(syncRate(130, 125, 1)).toBeCloseTo(130 / 125, 10);
  });

  it("leaves rate alone when the deck's own BPM is unknown", () => {
    expect(syncRate(130, 0, 1.05)).toBe(1.05);
  });
});
