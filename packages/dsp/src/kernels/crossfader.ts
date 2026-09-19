/**
 * Crossfader curves, matching the three a DJ mixer offers.
 *
 * Position is -1 (full A) .. 0 (centre) .. +1 (full B).
 */
export type CrossfaderCurve = "linear" | "constant-power" | "sharp";

export interface CrossfaderGains {
  a: number;
  b: number;
}

/** How fast `sharp` reaches full gain; scratch DJs want it near-instant. */
const SHARP_CUT_IN = 0.08;

export function crossfaderGains(
  position: number,
  curve: CrossfaderCurve,
  out: CrossfaderGains,
): CrossfaderGains {
  const p = Math.min(Math.max(position, -1), 1);
  // Normalised 0..1 travel from A to B.
  const x = (p + 1) * 0.5;

  switch (curve) {
    case "linear": {
      // Dips ~6 dB at centre when both decks carry the same material.
      out.a = 1 - x;
      out.b = x;
      break;
    }
    case "constant-power": {
      // -3 dB at centre: the curve to use when beatmatching two full mixes.
      const angle = x * (Math.PI / 2);
      out.a = Math.cos(angle);
      out.b = Math.sin(angle);
      break;
    }
    case "sharp": {
      // Both decks at full gain across the whole middle; only the last sliver
      // of travel at each end cuts. This is the scratch/cut curve.
      out.a = x >= 1 - SHARP_CUT_IN ? Math.max(0, (1 - x) / SHARP_CUT_IN) : 1;
      out.b = x <= SHARP_CUT_IN ? Math.max(0, x / SHARP_CUT_IN) : 1;
      break;
    }
  }
  return out;
}
