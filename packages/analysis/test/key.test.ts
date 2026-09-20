import { describe, it, expect } from "vitest";
import { detectKey } from "../src/key.js";

const SR = 48000;

/** Equal-tempered frequency `semitonesFromA4` semitones from A4 = 440 Hz. */
function noteFreq(semitonesFromA4: number): number {
  return 440 * Math.pow(2, semitonesFromA4 / 12);
}

function toneMix(freqs: number[], seconds: number, sampleRate = SR): Float32Array {
  const samples = new Float32Array(Math.floor(seconds * sampleRate));
  for (let i = 0; i < samples.length; i++) {
    let sum = 0;
    for (const f of freqs) sum += Math.sin((2 * Math.PI * f * i) / sampleRate);
    samples[i] = sum / freqs.length;
  }
  return samples;
}

describe("detectKey", () => {
  it("identifies a C major triad (root, third, fifth, root an octave down) as 8B", () => {
    const samples = toneMix([noteFreq(-21), noteFreq(-9), noteFreq(-5), noteFreq(-2)], 4);
    expect(detectKey(samples, SR).camelot).toBe("8B");
  });

  it("identifies an A minor triad as 8A", () => {
    const samples = toneMix([noteFreq(-24), noteFreq(-12), noteFreq(-9), noteFreq(-5)], 4);
    expect(detectKey(samples, SR).camelot).toBe("8A");
  });

  it("returns a well-formed Camelot code even for silence", () => {
    const result = detectKey(new Float32Array(SR * 2), SR);
    expect(result.camelot).toMatch(/^([1-9]|1[0-2])[AB]$/);
  });
});
