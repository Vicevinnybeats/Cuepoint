/** Pure helpers around tempo — no engine state, easy to unit test.
 *
 * This drives the pitch-locked "rate" field (see protocol.ts's DeckMessage):
 * a tempo change here never changes pitch, since it's the playhead's speed,
 * not a resample ratio — see TimeStretcher. */

/** A +-8% tempo range is the DJ-mixer standard; wider ranges exist but this
 * is the default range shown on the UI's BPM control. */
export const TEMPO_RANGE_PERCENT = 8;

export function tempoPercentToRatio(percent: number): number {
  return 1 + percent / 100;
}

export function ratioToTempoPercent(ratio: number): number {
  return (ratio - 1) * 100;
}

export function clampTempoPercent(percent: number, range = TEMPO_RANGE_PERCENT): number {
  return Math.min(Math.max(percent, -range), range);
}

/** Rate deck B needs to match deck A's effective BPM, given B's own BPM. */
export function syncRate(targetBpm: number, ownBpm: number, ownRate: number): number {
  if (ownBpm <= 0) return ownRate;
  return targetBpm / ownBpm;
}
