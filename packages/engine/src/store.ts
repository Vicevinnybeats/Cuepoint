import { createStore } from "zustand/vanilla";
import { DECK_IDS, DEFAULT_CROSSFADER_ASSIGN } from "./types.js";
import type { DeckId, DeckUiState, MixerUiState, HotCue } from "./types.js";
import type { CrossfaderAssign } from "@cuepoint/dsp/kernels";

function defaultDeck(): DeckUiState {
  return {
    track: null,
    hotCues: [],
    gain: 1,
    eqLow: 0.5,
    eqMid: 0.5,
    eqHigh: 0.5,
    filter: 0,
    faderLevel: 1,
    cueActive: false,
    tempoPercent: 0,
    playRequested: false,
    syncEnabled: false,
    loopLengthBeats: null,
    cuePoint: 0,
  };
}

export interface DecksStore {
  decks: Record<DeckId, DeckUiState>;
  mixer: MixerUiState;

  setEq(deck: DeckId, band: "eqLow" | "eqMid" | "eqHigh", value: number): void;
  setFilter(deck: DeckId, value: number): void;
  setGain(deck: DeckId, value: number): void;
  setFader(deck: DeckId, value: number): void;
  setCue(deck: DeckId, active: boolean): void;
  setTempo(deck: DeckId, percent: number): void;
  togglePlay(deck: DeckId): void;
  setPlaying(deck: DeckId, playing: boolean): void;
  toggleSync(deck: DeckId): void;
  loadTrack(deck: DeckId, track: DeckUiState["track"], hotCues?: HotCue[], cuePoint?: number): void;
  setCuePoint(deck: DeckId, frame: number): void;
  setHotCue(deck: DeckId, cue: HotCue): void;
  clearHotCue(deck: DeckId, index: number): void;
  setLoopLength(deck: DeckId, beats: number | null): void;

  setCrossfader(position: number): void;
  setCrossfaderCurve(curve: MixerUiState["crossfaderCurve"]): void;
  setCrossfaderAssign(deck: DeckId, assign: CrossfaderAssign): void;
  setMasterGain(value: number): void;
}

/** UI-only state — see DeckUiState. The engine remains the source of truth
 * for playhead position, meters and loop-active status. */
export const decksStore = createStore<DecksStore>((set) => ({
  decks: Object.fromEntries(DECK_IDS.map((id) => [id, defaultDeck()])) as Record<DeckId, DeckUiState>,
  mixer: {
    crossfaderPosition: 0,
    crossfaderCurve: "constant-power",
    masterGain: 1,
    crossfaderAssign: { ...DEFAULT_CROSSFADER_ASSIGN },
  },

  setEq: (deck, band, value) =>
    set((s) => ({ decks: { ...s.decks, [deck]: { ...s.decks[deck], [band]: value } } })),
  setFilter: (deck, value) =>
    set((s) => ({ decks: { ...s.decks, [deck]: { ...s.decks[deck], filter: value } } })),
  setGain: (deck, value) =>
    set((s) => ({ decks: { ...s.decks, [deck]: { ...s.decks[deck], gain: value } } })),
  setFader: (deck, value) =>
    set((s) => ({ decks: { ...s.decks, [deck]: { ...s.decks[deck], faderLevel: value } } })),
  setCue: (deck, active) =>
    set((s) => ({ decks: { ...s.decks, [deck]: { ...s.decks[deck], cueActive: active } } })),
  setTempo: (deck, percent) =>
    set((s) => ({ decks: { ...s.decks, [deck]: { ...s.decks[deck], tempoPercent: percent } } })),
  togglePlay: (deck) =>
    set((s) => ({
      decks: {
        ...s.decks,
        [deck]: { ...s.decks[deck], playRequested: !s.decks[deck].playRequested },
      },
    })),
  setPlaying: (deck, playing) =>
    set((s) => ({ decks: { ...s.decks, [deck]: { ...s.decks[deck], playRequested: playing } } })),
  toggleSync: (deck) =>
    set((s) => ({
      decks: {
        ...s.decks,
        [deck]: { ...s.decks[deck], syncEnabled: !s.decks[deck].syncEnabled },
      },
    })),
  loadTrack: (deck, track, hotCues = [], cuePoint = 0) =>
    set((s) => ({
      decks: { ...s.decks, [deck]: { ...defaultDeck(), track, hotCues, cuePoint } },
    })),
  setHotCue: (deck, cue) =>
    set((s) => {
      const existing = s.decks[deck].hotCues.filter((c) => c.index !== cue.index);
      return {
        decks: {
          ...s.decks,
          [deck]: { ...s.decks[deck], hotCues: [...existing, cue].sort((a, b) => a.index - b.index) },
        },
      };
    }),
  clearHotCue: (deck, index) =>
    set((s) => ({
      decks: {
        ...s.decks,
        [deck]: {
          ...s.decks[deck],
          hotCues: s.decks[deck].hotCues.filter((c) => c.index !== index),
        },
      },
    })),
  setCuePoint: (deck, frame) =>
    set((s) => ({ decks: { ...s.decks, [deck]: { ...s.decks[deck], cuePoint: frame } } })),
  setLoopLength: (deck, beats) =>
    set((s) => ({ decks: { ...s.decks, [deck]: { ...s.decks[deck], loopLengthBeats: beats } } })),

  setCrossfader: (position) => set((s) => ({ mixer: { ...s.mixer, crossfaderPosition: position } })),
  setCrossfaderCurve: (curve) => set((s) => ({ mixer: { ...s.mixer, crossfaderCurve: curve } })),
  setCrossfaderAssign: (deck, assign) =>
    set((s) => ({
      mixer: { ...s.mixer, crossfaderAssign: { ...s.mixer.crossfaderAssign, [deck]: assign } },
    })),
  setMasterGain: (value) => set((s) => ({ mixer: { ...s.mixer, masterGain: value } })),
}));
