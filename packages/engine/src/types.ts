import type { CrossfaderCurve, CrossfaderAssign } from "@cuepoint/dsp/kernels";

export type DeckId = "A" | "B" | "C" | "D";

/** Deck order everywhere it matters: worklet input index (crossfader
 * channel N = DECK_IDS[N]), UI layout, keyboard shortcuts. */
export const DECK_IDS: readonly DeckId[] = ["A", "B", "C", "D"];

export interface TrackMeta {
  id: string;
  title: string;
  artist: string;
  bpm: number;
  key: string;
  durationSeconds: number;
  /** Peak waveform, one value per ~pixel-column at the browser's zoom level. */
  waveform: Float32Array | null;
}

export interface HotCue {
  index: number;
  frame: number;
  color: string;
}

/**
 * UI-only state for one deck: what the controls are commanded to, and
 * metadata about the loaded track. Never the playhead or meters — those are
 * read from shared memory every animation frame and must not round-trip
 * through Zustand/React at audio rate.
 */
export interface DeckUiState {
  track: TrackMeta | null;
  hotCues: HotCue[];
  gain: number;
  eqLow: number;
  eqMid: number;
  eqHigh: number;
  filter: number;
  faderLevel: number;
  cueActive: boolean;
  tempoPercent: number;
  /** Commanded, not observed — the engine confirms via the snapshot loop. */
  playRequested: boolean;
  syncEnabled: boolean;
  loopLengthBeats: number | null;
  /** Main cue point, in frames. 0 (track start) until one is set. */
  cuePoint: number;
}

export interface MixerUiState {
  crossfaderPosition: number;
  crossfaderCurve: CrossfaderCurve;
  masterGain: number;
  /** Crossfader assign switch per deck (see CrossfaderAssign) — defaults to
   * the traditional two-deck split, A/B on the fader, C/D thru. */
  crossfaderAssign: Record<DeckId, CrossfaderAssign>;
}

export const DEFAULT_CROSSFADER_ASSIGN: Record<DeckId, CrossfaderAssign> = {
  A: "A",
  B: "B",
  C: "thru",
  D: "thru",
};
