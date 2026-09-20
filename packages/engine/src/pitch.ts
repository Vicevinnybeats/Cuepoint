/** Pure helpers around tempo/pitch — no engine state, easy to unit test. */

/** A +-8% pitch fader is the DJ-mixer standard; wider ranges exist but this
 * is the default range shown on the UI's pitch slider. */
export const PITCH_RANGE_PERCENT = 8;

export function pitchPercentToRate(percent: number): number {
  return 1 + percent / 100;
}

export function rateToPitchPercent(rate: number): number {
  return (rate - 1) * 100;
}

export function clampPitchPercent(percent: number, range = PITCH_RANGE_PERCENT): number {
  return Math.min(Math.max(percent, -range), range);
}

/** Rate deck B needs to match deck A's effective BPM, given B's own BPM. */
export function syncRate(targetBpm: number, ownBpm: number, ownRate: number): number {
  if (ownBpm <= 0) return ownRate;
  return targetBpm / ownBpm;
}
