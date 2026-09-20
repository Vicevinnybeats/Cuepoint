import { describe, it, expect } from "vitest";
import { computePeaks } from "../src/waveform.js";

describe("computePeaks", () => {
  it("returns one peak value per column", () => {
    const samples = new Float32Array(1000).fill(0.5);
    expect(computePeaks(samples, 50)).toHaveLength(50);
  });

  it("finds the true peak within each bucket", () => {
    const samples = new Float32Array(100).fill(0.1);
    samples[55] = 0.9;
    const peaks = computePeaks(samples, 10);
    // Sample 55 falls in bucket 5 (buckets of 10).
    expect(peaks[5]).toBeCloseTo(0.9, 5);
    expect(peaks[0]).toBeCloseTo(0.1, 5);
  });

  it("uses the absolute value, so negative peaks count", () => {
    const samples = new Float32Array(10).fill(0);
    samples[3] = -0.7;
    const peaks = computePeaks(samples, 1);
    expect(peaks[0]).toBeCloseTo(0.7, 5);
  });

  it("handles more columns than samples without throwing", () => {
    const samples = new Float32Array(5).fill(0.2);
    const peaks = computePeaks(samples, 20);
    expect(peaks).toHaveLength(20);
  });

  it("returns all zeros for empty input", () => {
    const peaks = computePeaks(new Float32Array(0), 10);
    expect(Array.from(peaks)).toEqual(new Array(10).fill(0));
  });
});
