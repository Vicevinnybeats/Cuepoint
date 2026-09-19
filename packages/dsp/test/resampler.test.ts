import { describe, it, expect } from "vitest";
import { TrackReader, catmullRom } from "../src/kernels/resampler.js";
import { SR, sine, peak, settledRms } from "./helpers.js";

/** Estimate a rendered sine's frequency by counting zero crossings. */
function estimateHz(block: Float32Array, sampleRate = SR): number {
  let crossings = 0;
  for (let i = 1; i < block.length; i++) {
    const a = block[i - 1] as number;
    const b = block[i] as number;
    if (a <= 0 && b > 0) crossings++;
  }
  return (crossings * sampleRate) / block.length;
}

function loadSine(reader: TrackReader, hz: number, frames: number): void {
  const mono = sine(hz, frames);
  reader.load([mono, mono]);
}

describe("catmullRom", () => {
  it("passes through the control points", () => {
    expect(catmullRom(0, 1, 2, 3, 0)).toBeCloseTo(1, 10);
    expect(catmullRom(0, 1, 2, 3, 1)).toBeCloseTo(2, 10);
  });

  it("reproduces a linear ramp exactly", () => {
    for (const t of [0.25, 0.5, 0.75]) {
      expect(catmullRom(0, 1, 2, 3, t)).toBeCloseTo(1 + t, 10);
    }
  });
});

describe("TrackReader", () => {
  it("renders silence with nothing loaded", () => {
    const r = new TrackReader();
    const l = new Float32Array(128).fill(1);
    const rt = new Float32Array(128).fill(1);
    r.render(l, rt, 128);
    expect(peak(l)).toBe(0);
    expect(peak(rt)).toBe(0);
  });

  it("reproduces the source at rate 1", () => {
    const r = new TrackReader();
    loadSine(r, 1000, SR);
    const l = new Float32Array(4096);
    const rt = new Float32Array(4096);
    r.render(l, rt, 4096);
    expect(estimateHz(l, SR)).toBeGreaterThan(960);
    expect(estimateHz(l, SR)).toBeLessThan(1040);
  });

  it("shifts pitch with rate, the way a tempo fader does", () => {
    for (const [rate, expectedHz] of [
      [1.08, 1080],
      [0.92, 920],
      [2, 2000],
    ] as const) {
      const r = new TrackReader();
      loadSine(r, 1000, SR);
      r.rate = rate;
      const l = new Float32Array(8192);
      const rt = new Float32Array(8192);
      r.render(l, rt, 8192);
      // Zero-crossing estimation is coarse; 3% is well inside a pitch check.
      expect(estimateHz(l, SR)).toBeGreaterThan(expectedHz * 0.97);
      expect(estimateHz(l, SR)).toBeLessThan(expectedHz * 1.03);
    }
  });

  it("advances the playhead by exactly rate per sample", () => {
    const r = new TrackReader();
    loadSine(r, 440, SR);
    r.rate = 0.5;
    const l = new Float32Array(1000);
    const rt = new Float32Array(1000);
    r.render(l, rt, 1000);
    expect(r.position).toBeCloseTo(500, 6);
  });

  it("interpolates rather than dropping to the nearest sample", () => {
    const r = new TrackReader();
    loadSine(r, 1000, SR);
    r.rate = 1.0005;
    const l = new Float32Array(8192);
    const rt = new Float32Array(8192);
    r.render(l, rt, 8192);
    // Nearest-neighbour reading at this rate produces visible steps; cubic
    // interpolation keeps the waveform smooth.
    let maxJump = 0;
    for (let i = 1; i < l.length; i++) {
      maxJump = Math.max(maxJump, Math.abs((l[i] as number) - (l[i - 1] as number)));
    }
    expect(maxJump).toBeLessThan(0.15);
  });

  describe("loops", () => {
    it("wraps sample-accurately at the loop out point", () => {
      const r = new TrackReader();
      loadSine(r, 100, SR);
      r.seek(1000);
      r.setLoop(1000, 1500);
      const l = new Float32Array(2000);
      const rt = new Float32Array(2000);
      r.render(l, rt, 2000);
      // 2000 samples through a 500-sample loop lands back at the start.
      expect(r.position).toBeCloseTo(1000, 6);
    });

    it("never reads outside the loop region", () => {
      const frames = 4000;
      const ramp = new Float32Array(frames);
      for (let i = 0; i < frames; i++) ramp[i] = i / frames;
      const r = new TrackReader();
      r.load([ramp, ramp]);
      r.seek(1000);
      r.setLoop(1000, 1500);
      const l = new Float32Array(3000);
      const rt = new Float32Array(3000);
      r.render(l, rt, 3000);
      // Values correspond to indices 1000..1500 of a 0..1 ramp.
      for (let i = 0; i < l.length; i++) {
        expect(l[i] as number).toBeGreaterThanOrEqual(1000 / frames - 0.01);
        expect(l[i] as number).toBeLessThanOrEqual(1500 / frames + 0.01);
      }
    });

    it("keeps the loop seam continuous", () => {
      const r = new TrackReader();
      loadSine(r, 1000, SR);
      r.seek(2000);
      // A loop of exactly 48 samples at 1 kHz is one full cycle, so the seam
      // should be inaudible: no sample-to-sample discontinuity.
      r.setLoop(2000, 2048);
      const l = new Float32Array(2048);
      const rt = new Float32Array(2048);
      r.render(l, rt, 2048);
      let maxJump = 0;
      for (let i = 1; i < l.length; i++) {
        maxJump = Math.max(maxJump, Math.abs((l[i] as number) - (l[i - 1] as number)));
      }
      expect(maxJump).toBeLessThan(0.2);
    });

    it("rejects a loop too short to interpolate", () => {
      const r = new TrackReader();
      loadSine(r, 440, SR);
      r.setLoop(100, 102);
      expect(r.loop.active).toBe(false);
    });

    it("wraps backwards through the loop in point in reverse", () => {
      const r = new TrackReader();
      loadSine(r, 440, SR);
      r.seek(1100);
      r.setLoop(1000, 1500);
      r.rate = -1;
      const l = new Float32Array(300);
      const rt = new Float32Array(300);
      r.render(l, rt, 300);
      expect(r.position).toBeGreaterThanOrEqual(1000);
      expect(r.position).toBeLessThan(1500);
    });

    it("clears cleanly", () => {
      const r = new TrackReader();
      loadSine(r, 440, SR);
      r.setLoop(1000, 1500);
      r.clearLoop();
      expect(r.loop.active).toBe(false);
    });
  });

  it("goes silent past the end of the track", () => {
    const r = new TrackReader();
    loadSine(r, 440, 1000);
    r.seek(990);
    const l = new Float32Array(500);
    const rt = new Float32Array(500);
    r.render(l, rt, 500);
    expect(r.atEnd).toBe(true);
    expect(settledRms(l)).toBe(0);
  });

  it("feeds a mono track to both sides", () => {
    const mono = sine(440, 2000);
    const r = new TrackReader();
    r.load([mono]);
    const l = new Float32Array(256);
    const rt = new Float32Array(256);
    r.render(l, rt, 256);
    expect(l[128]).toBeCloseTo(rt[128] as number, 6);
  });

  it("clamps a seek past the ends", () => {
    const r = new TrackReader();
    loadSine(r, 440, 1000);
    r.seek(-50);
    expect(r.position).toBe(0);
    r.seek(99999);
    expect(r.position).toBe(999);
  });
});
