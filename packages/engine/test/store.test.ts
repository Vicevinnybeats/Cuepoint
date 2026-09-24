import { describe, it, expect, beforeEach } from "vitest";
import { decksStore } from "../src/store.js";

describe("decksStore", () => {
  beforeEach(() => {
    const initial = decksStore.getInitialState();
    decksStore.setState(initial, true);
  });

  it("starts both decks empty with centred controls", () => {
    const { decks } = decksStore.getState();
    expect(decks.A.track).toBeNull();
    expect(decks.A.eqLow).toBe(0.5);
    expect(decks.A.faderLevel).toBe(1);
  });

  it("updates one deck's EQ band without touching the other deck", () => {
    decksStore.getState().setEq("A", "eqLow", 0.1);
    const { decks } = decksStore.getState();
    expect(decks.A.eqLow).toBe(0.1);
    expect(decks.B.eqLow).toBe(0.5);
  });

  it("toggles play state", () => {
    expect(decksStore.getState().decks.A.playRequested).toBe(false);
    decksStore.getState().togglePlay("A");
    expect(decksStore.getState().decks.A.playRequested).toBe(true);
    decksStore.getState().togglePlay("A");
    expect(decksStore.getState().decks.A.playRequested).toBe(false);
  });

  it("adds and replaces hot cues by index", () => {
    const s = decksStore.getState();
    s.setHotCue("A", { index: 0, frame: 1000, color: "#f00" });
    s.setHotCue("A", { index: 1, frame: 2000, color: "#0f0" });
    expect(decksStore.getState().decks.A.hotCues).toHaveLength(2);

    s.setHotCue("A", { index: 0, frame: 5000, color: "#00f" });
    const cues = decksStore.getState().decks.A.hotCues;
    expect(cues).toHaveLength(2);
    expect(cues.find((c) => c.index === 0)?.frame).toBe(5000);
  });

  it("clears a hot cue by index", () => {
    const s = decksStore.getState();
    s.setHotCue("A", { index: 0, frame: 1000, color: "#f00" });
    s.clearHotCue("A", 0);
    expect(decksStore.getState().decks.A.hotCues).toHaveLength(0);
  });

  it("resets a deck's controls to default when a new track loads", () => {
    const s = decksStore.getState();
    s.setEq("A", "eqLow", 0.1);
    s.setFader("A", 0.3);
    s.loadTrack("A", {
      id: "t1",
      title: "Test",
      artist: "Someone",
      bpm: 128,
      key: "8A",
      durationSeconds: 200,
      waveform: null,
    });
    const deckA = decksStore.getState().decks.A;
    expect(deckA.eqLow).toBe(0.5);
    expect(deckA.faderLevel).toBe(1);
    expect(deckA.track?.title).toBe("Test");
  });

  it("updates mixer state independently of deck state", () => {
    decksStore.getState().setCrossfader(0.5);
    decksStore.getState().setCrossfaderCurve("sharp");
    const { mixer } = decksStore.getState();
    expect(mixer.crossfaderPosition).toBe(0.5);
    expect(mixer.crossfaderCurve).toBe("sharp");
  });

  it("sets the main cue point, and restores it with a loaded track", () => {
    const s = decksStore.getState();
    s.setCuePoint("A", 48_000);
    expect(decksStore.getState().decks.A.cuePoint).toBe(48_000);
    s.loadTrack("B", null, [], 96_000);
    expect(decksStore.getState().decks.B.cuePoint).toBe(96_000);
    s.loadTrack("B", null);
    expect(decksStore.getState().decks.B.cuePoint).toBe(0);
  });
});
