import { describe, it, expect } from "vitest";
import { crossfaderGains } from "../src/kernels/crossfader.js";
import type { CrossfaderCurve, CrossfaderGains } from "../src/kernels/crossfader.js";

const out: CrossfaderGains = { a: 0, b: 0 };
const curves: CrossfaderCurve[] = ["linear", "constant-power", "sharp"];

describe("crossfaderGains", () => {
  it("isolates deck A hard left and deck B hard right on every curve", () => {
    for (const curve of curves) {
      const left = crossfaderGains(-1, curve, out);
      expect(left.a).toBeCloseTo(1, 6);
      expect(left.b).toBeCloseTo(0, 6);
      const right = crossfaderGains(1, curve, out);
      expect(right.a).toBeCloseTo(0, 6);
      expect(right.b).toBeCloseTo(1, 6);
    }
  });

  it("is symmetric about centre", () => {
    for (const curve of curves) {
      for (const p of [0.25, 0.5, 0.75]) {
        const l = { ...crossfaderGains(-p, curve, out) };
        const r = { ...crossfaderGains(p, curve, out) };
        expect(l.a).toBeCloseTo(r.b, 6);
        expect(l.b).toBeCloseTo(r.a, 6);
      }
    }
  });

  it("dips 6 dB at centre on the linear curve", () => {
    const g = crossfaderGains(0, "linear", out);
    expect(g.a).toBeCloseTo(0.5, 6);
    expect(g.b).toBeCloseTo(0.5, 6);
  });

  it("holds -3 dB at centre on the constant-power curve", () => {
    const g = crossfaderGains(0, "constant-power", out);
    expect(g.a).toBeCloseTo(Math.SQRT1_2, 6);
    expect(g.a * g.a + g.b * g.b).toBeCloseTo(1, 6);
  });

  it("keeps both decks open across the middle on the sharp curve", () => {
    for (const p of [-0.8, -0.3, 0, 0.3, 0.8]) {
      const g = crossfaderGains(p, "sharp", out);
      expect(g.a).toBeCloseTo(1, 6);
      expect(g.b).toBeCloseTo(1, 6);
    }
  });

  it("clamps positions past the fader's travel", () => {
    const g = crossfaderGains(-9, "constant-power", out);
    expect(g.a).toBeCloseTo(1, 6);
  });

  it("writes into the supplied object so the audio thread allocates nothing", () => {
    const target: CrossfaderGains = { a: 0, b: 0 };
    expect(crossfaderGains(0.5, "linear", target)).toBe(target);
  });
});
