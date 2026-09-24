/**
 * Messages between the engine (main thread) and the audio thread.
 *
 * Kept in one file so both sides compile against the same shapes. Everything
 * the audio thread needs per render quantum is either a scalar it already
 * holds or a slot in shared memory; these messages are control-rate only.
 */

import type { CrossfaderCurve, CrossfaderAssign } from "./kernels/crossfader.js";

export interface LoadTrackMessage {
  type: "load";
  /** Deinterleaved channel data, transferred so no copy is made. */
  channels: ArrayBuffer[];
  frames: number;
  sampleRate: number;
  /** Analysed tempo, used to derive the effective BPM readout. */
  bpm: number;
}

export type DeckMessage =
  | LoadTrackMessage
  | { type: "unload" }
  | { type: "play" }
  | { type: "pause" }
  /** Jump the playhead. `frame` is absolute, fractional allowed. */
  | { type: "seek"; frame: number }
  /** Tempo ratio; 1 is nominal. Drives the playhead (loop wrap, end
   * detection, effective BPM) — it does not resample audio, so it never
   * changes pitch. See TimeStretcher, which reads content at local rate 1
   * and re-syncs to this playhead every half-grain. Negative/scratch rates
   * are not supported on this path. */
  | { type: "rate"; value: number }
  | { type: "loop"; start: number; end: number }
  | { type: "clearLoop" }
  | { type: "eq"; low: number; mid: number; high: number }
  | { type: "filter"; value: number }
  /** Channel trim, linear. */
  | { type: "gain"; value: number }
  /** Channel fader position, 0..1. */
  | { type: "fader"; value: number }
  /** Cut the channel out of the mix without moving the fader. */
  | { type: "cue"; enabled: boolean };

export type MasterMessage =
  | { type: "crossfader"; position: number }
  | { type: "crossfaderCurve"; curve: CrossfaderCurve }
  | { type: "masterGain"; value: number }
  /** Which side of the crossfader input `channel` (0-based, in the order
   * the deck inputs were connected) responds to — or "thru" to bypass the
   * crossfader entirely, always at full gain. */
  | { type: "crossfaderAssign"; channel: number; assign: CrossfaderAssign };
