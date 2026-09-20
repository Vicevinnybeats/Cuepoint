import { describe, it, expect } from "vitest";
import { detectBpm, computeEnvelope } from "../src/bpm.js";

const SR = 48000;

/** A click track: short impulses spaced exactly `60/bpm` seconds apart. */
function clickTrack(bpm: number, seconds: number, sampleRate = SR): Float32Array {
  const samples = new Float32Array(Math.floor(seconds * sampleRate));
  const intervalSamples = (60 / bpm) * sampleRate;
  const clickLength = 40;
  for (let beat = 0; beat * intervalSamples < samples.length; beat++) {
    const start = Math.round(beat * intervalSamples);
    for (let i = 0; i < clickLength && start + i < samples.length; i++) {
      // A short decaying burst, closer to a real percussive onset than a
      // single-sample spike.
      samples[start + i] = Math.exp(-i / 8);
    }
  }
  return samples;
}

describe("computeEnvelope", () => {
  it("tracks louder sections as higher energy", () => {
    const quiet = new Float32Array(4096).fill(0.01);
    const loud = new Float32Array(4096).fill(0.5);
    const track = new Float32Array([...quiet, ...loud]);
    const envelope = computeEnvelope(track, 512);
    const first = envelope[0] as number;
    const last = envelope[envelope.length - 1] as number;
    expect(last).toBeGreaterThan(first * 10);
  });
});

describe("detectBpm", () => {
  it.each([90, 120, 128, 140, 174])("detects a %d BPM click track within 2 BPM", (bpm) => {
    const track = clickTrack(bpm, 20);
    const detected = detectBpm(track, SR);
    expect(detected).toBeGreaterThan(bpm - 2);
    expect(detected).toBeLessThan(bpm + 2);
  });

  it("folds an octave-doubled estimate back into the target range", () => {
    // 160 BPM outside the default 70-180 range check: use a track whose
    // autocorrelation peak plausibly lands on a half-tempo harmonic and
    // confirm the result still comes back inside range.
    const track = clickTrack(150, 20);
    const detected = detectBpm(track, SR, { minBpm: 70, maxBpm: 180 });
    expect(detected).toBeGreaterThanOrEqual(70);
    expect(detected).toBeLessThanOrEqual(180);
  });

  it("returns a value in range even for near-silent audio", () => {
    const silence = new Float32Array(SR * 5);
    const detected = detectBpm(silence, SR);
    expect(Number.isFinite(detected)).toBe(true);
    expect(detected).toBeGreaterThanOrEqual(70);
    expect(detected).toBeLessThanOrEqual(180);
  });
});
