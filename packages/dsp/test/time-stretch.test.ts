import { describe, it, expect } from "vitest";
import { TrackReader } from "../src/kernels/resampler.js";
import { TimeStretcher } from "../src/kernels/time-stretch.js";
import { SR, sine } from "./helpers.js";

/**
 * Estimate a rendered sine's frequency by autocorrelation, searching only
 * near `expectedHz`. Zero-crossing counting is too sensitive to the isolated
 * phase discontinuities a synchronous granular time-stretcher leaves at each
 * grain boundary (a real but minor artifact of this simple two-voice OLA);
 * autocorrelation instead finds the lag the whole waveform agrees on, so a
 * handful of edge glitches can't bias it the way a crossing count can.
 */
function estimateHz(block: Float32Array, expectedHz: number, sampleRate = SR): number {
  const minLag = Math.floor(sampleRate / (expectedHz * 1.1));
  const maxLag = Math.ceil(sampleRate / (expectedHz * 0.9));
  let bestLag = minLag;
  let bestCorr = -Infinity;
  for (let lag = minLag; lag <= maxLag; lag++) {
    let sum = 0;
    for (let i = 0; i < block.length - maxLag; i++) {
      sum += (block[i] as number) * (block[i + lag] as number);
    }
    if (sum > bestCorr) {
      bestCorr = sum;
      bestLag = lag;
    }
  }
  return sampleRate / bestLag;
}

function loadSine(reader: TrackReader, hz: number, frames: number): void {
  const mono = sine(hz, frames);
  reader.load([mono, mono]);
}

describe("TimeStretcher", () => {
  it("renders silence with nothing loaded", () => {
    const reader = new TrackReader();
    const stretcher = new TimeStretcher(SR);
    const l = new Float32Array(256).fill(1);
    const r = new Float32Array(256).fill(1);
    stretcher.render(reader, l, r, 256);
    expect(l.every((x) => x === 0)).toBe(true);
    expect(r.every((x) => x === 0)).toBe(true);
  });

  it.each([0.7, 1, 1.3])("keeps pitch constant at tempo ratio %s", (ratio) => {
    const frames = SR * 2;
    const reader = new TrackReader();
    loadSine(reader, 440, frames);
    reader.rate = ratio;
    const stretcher = new TimeStretcher(SR);
    stretcher.reset(reader);

    const outL = new Float32Array(frames);
    const outR = new Float32Array(frames);
    stretcher.render(reader, outL, outR, frames);

    // Skip the first grain while the two voices are still settling in.
    const settled = outL.subarray(SR * 0.5, SR * 1.5);
    expect(estimateHz(settled, 440)).toBeCloseTo(440, -1);
  });

  it.each([0.7, 1, 1.3])("advances the playhead at the tempo ratio %s", (ratio) => {
    const frames = 10_000;
    const reader = new TrackReader();
    loadSine(reader, 200, SR * 2);
    reader.rate = ratio;
    const stretcher = new TimeStretcher(SR);
    stretcher.reset(reader);

    const outL = new Float32Array(frames);
    const outR = new Float32Array(frames);
    stretcher.render(reader, outL, outR, frames);

    expect(reader.position).toBeCloseTo(frames * ratio, -1);
  });

  it("does not advance the playhead past the track end", () => {
    const frames = 2000;
    const reader = new TrackReader();
    loadSine(reader, 200, 1000);
    reader.rate = 1;
    const stretcher = new TimeStretcher(SR);
    stretcher.reset(reader);

    const outL = new Float32Array(frames);
    const outR = new Float32Array(frames);
    stretcher.render(reader, outL, outR, frames);

    expect(reader.atEnd).toBe(true);
    // Tail past the track end is silent, matching TrackReader.render.
    expect(outL[frames - 1]).toBe(0);
  });
});
