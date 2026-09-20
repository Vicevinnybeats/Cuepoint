import { describe, it, expect } from "vitest";
import { fft, magnitudeSpectrum } from "../src/fft.js";

function peakBin(magnitudes: Float64Array): number {
  let peak = 0;
  for (let i = 1; i < magnitudes.length; i++) {
    if ((magnitudes[i] as number) > (magnitudes[peak] as number)) peak = i;
  }
  return peak;
}

describe("fft", () => {
  it("shows a single peak bin for a pure bin-aligned sine", () => {
    const n = 1024;
    const sampleRate = 48000;
    const binIndex = 20;
    const freq = (binIndex * sampleRate) / n;
    const samples = new Float32Array(n);
    for (let i = 0; i < n; i++) samples[i] = Math.sin((2 * Math.PI * freq * i) / sampleRate);
    expect(peakBin(magnitudeSpectrum(samples))).toBe(binIndex);
  });

  it("puts peak energy in bin 0 for a DC signal", () => {
    const samples = new Float32Array(512).fill(1);
    expect(peakBin(magnitudeSpectrum(samples))).toBe(0);
  });

  it("rejects a non-power-of-two length", () => {
    expect(() => fft(new Float64Array(100), new Float64Array(100))).toThrow();
  });

  it("rejects mismatched real/imag lengths", () => {
    expect(() => fft(new Float64Array(64), new Float64Array(32))).toThrow();
  });
});
