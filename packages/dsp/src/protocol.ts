/**
 * Messages between the engine (main thread) and the audio thread.
 *
 * Kept in one file so both sides compile against the same shapes. Everything
 * the audio thread needs per render quantum is either a scalar it already
 * holds or a slot in shared memory; these messages are control-rate only.
 */

import type { CrossfaderCurve } from "./kernels/crossfader.js";

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
  /** Playback rate multiplier; 1 is nominal, negative plays backwards. */
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
  /** Snapshot transport for pages without cross-origin isolation. */
  | { type: "snapshotInterval"; frames: number };

/** Posted by a worklet when SharedArrayBuffer is unavailable. */
export interface SnapshotMessage {
  type: "snapshot";
  playheadFrames: number;
  peakLeft: number;
  peakRight: number;
  playing: boolean;
  loopActive: boolean;
  endedCount: number;
}
