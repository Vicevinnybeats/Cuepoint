import { describe, it, expect } from "vitest";
import { Biquad, magnitudeAt } from "../src/kernels/biquad.js";
import { SR, measureGain, expectGainCloseDb, settledRms, sine } from "./helpers.js";

describe("Biquad", () => {
  it("passes signal unchanged when bypassed", () => {
    const f = new Biquad(SR);
    f.setBypass();
    const block = sine(1000, 1024);
    const before = Float32Array.from(block);
    f.process(block, block.length);
    for (let i = 0; i < block.length; i++) {
      expect(block[i]).toBeCloseTo(before[i] as number, 6);
    }
  });

  describe("offline render matches the analytic response", () => {
    const cases: Array<[string, () => Biquad, number[]]> = [
      [
        "lowpass at 1 kHz",
        () => {
          const f = new Biquad(SR);
          f.set("lowpass", 1000, Math.SQRT1_2);
          return f;
        },
        [100, 500, 1000, 4000, 8000],
      ],
      [
        "highpass at 1 kHz",
        () => {
          const f = new Biquad(SR);
          f.set("highpass", 1000, Math.SQRT1_2);
          return f;
        },
        [200, 1000, 3000, 9000],
      ],
      [
        "peaking +6 dB at 1 kHz",
        () => {
          const f = new Biquad(SR);
          f.set("peaking", 1000, 1, 6);
          return f;
        },
        [200, 1000, 5000],
      ],
      [
        "low shelf -12 dB at 200 Hz",
        () => {
          const f = new Biquad(SR);
          f.set("lowshelf", 200, Math.SQRT1_2, -12);
          return f;
        },
        [50, 200, 2000],
      ],
      [
        "high shelf +6 dB at 4 kHz",
        () => {
          const f = new Biquad(SR);
          f.set("highshelf", 4000, Math.SQRT1_2, 6);
          return f;
        },
        [500, 4000, 12000],
      ],
    ];

    for (const [label, make, probes] of cases) {
      it(label, () => {
        for (const hz of probes) {
          const f = make();
          const expected = magnitudeAt(f.coefficients(), hz, SR);
          const actual = measureGain(hz, (b, n) => f.process(b, n));
          expectGainCloseDb(actual, expected, 0.35);
        }
      });
    }
  });

  it("is -3 dB at its lowpass cutoff", () => {
    const f = new Biquad(SR);
    f.set("lowpass", 1000, Math.SQRT1_2);
    const g = measureGain(1000, (b, n) => f.process(b, n));
    expectGainCloseDb(g, Math.SQRT1_2, 0.35);
  });

  it("stays stable across an aggressive resonance sweep", () => {
    const f = new Biquad(SR);
    const block = sine(440, 4096);
    for (let step = 0; step <= 64; step++) {
      f.set("lowpass", 30 * Math.pow(600, step / 64), 0.7 + step * 0.2);
      f.process(block, block.length);
      expect(Number.isFinite(settledRms(block))).toBe(true);
    }
  });

  it("clamps a cutoff above Nyquist instead of producing NaN", () => {
    const f = new Biquad(SR);
    f.set("lowpass", SR, Math.SQRT1_2);
    const c = f.coefficients();
    for (const v of [c.b0, c.b1, c.b2, c.a1, c.a2]) expect(Number.isFinite(v)).toBe(true);
  });

  it("clears its state on reset", () => {
    const f = new Biquad(SR);
    f.set("lowpass", 500, 4);
    const loud = sine(500, 2048, SR, 1);
    f.process(loud, loud.length);
    f.reset();
    const silence = new Float32Array(512);
    f.process(silence, silence.length);
    expect(Math.max(...silence)).toBe(0);
  });
});
