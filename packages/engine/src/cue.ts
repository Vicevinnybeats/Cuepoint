/**
 * Main CUE button behaviour, CDJ-style (Traktor's default "CDJ" cue mode):
 *
 * - Playing: CUE jumps back to the cue point and stops.
 * - Paused on the cue point: holding CUE plays from it (preview); letting go
 *   returns to it and stops.
 * - Paused anywhere else: CUE sets a new cue point right there, then
 *   behaves as above.
 *
 * Pressing PLAY while holding CUE keeps playing after CUE is released — that
 * part lives in the UI, since it's about the release, not the press.
 */
export type CuePress =
  | { kind: "return-and-stop"; cuePoint: number }
  | { kind: "preview"; cuePoint: number; cuePointChanged: boolean };

/** Positions this close count as "on the cue point" (sub-frame jitter). */
const SAME_POSITION_FRAMES = 1;

export function pressCue(playing: boolean, playhead: number, cuePoint: number): CuePress {
  if (playing) return { kind: "return-and-stop", cuePoint };
  const moved = Math.abs(playhead - cuePoint) > SAME_POSITION_FRAMES;
  return { kind: "preview", cuePoint: moved ? playhead : cuePoint, cuePointChanged: moved };
}
