"use client";

import { useCallback, useRef, useState } from "react";
import { useStore } from "zustand/react";
import { decksStore, syncRate, clampTempoPercent, ratioToTempoPercent, pressCue } from "@cuepoint/engine";
import type { DeckId } from "@cuepoint/engine";
import { emptySnapshot } from "@cuepoint/dsp";
import { db } from "@cuepoint/library";
import { useEngine } from "@/lib/engine-provider";
import { useDeckFrame } from "@/hooks/useDeckFrame";
import { useDeckKeys, DECK_KEY_HINTS } from "@/hooks/useDeckKeys";
import { JogWheel } from "./JogWheel";
import { Waveform } from "./Waveform";
import type { WaveformMarker } from "./Waveform";
import { LoopControls } from "./LoopControls";
import { TimeDisplay } from "./TimeDisplay";
import { Slider } from "./Slider";
import { cx } from "@/lib/cx";

const HOT_CUE_COLORS = ["#ff5a3c", "#ffb020", "#35d07f", "#4aa8ff"];

export function DeckPanel({ deck }: { deck: DeckId }) {
  const otherDeck: DeckId = deck === "A" ? "B" : "A";
  const { engine, connect, analyzeTrack } = useEngine();
  const state = useStore(decksStore, (s) => s.decks[deck]);
  const setTempo = useStore(decksStore, (s) => s.setTempo);
  const toggleSync = useStore(decksStore, (s) => s.toggleSync);
  const setCue = useStore(decksStore, (s) => s.setCue);
  const loadTrack = useStore(decksStore, (s) => s.loadTrack);
  const setHotCue = useStore(decksStore, (s) => s.setHotCue);
  const setPlaying = useStore(decksStore, (s) => s.setPlaying);
  const setLoopLength = useStore(decksStore, (s) => s.setLoopLength);
  const setCuePoint = useStore(decksStore, (s) => s.setCuePoint);
  const clearHotCue = useStore(decksStore, (s) => s.clearHotCue);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [loading, setLoading] = useState(false);
  const playingIndicatorRef = useRef<HTMLDivElement | null>(null);
  /** Cue point of the CUE press currently held for preview, or null. */
  const cuePreviewRef = useRef<number | null>(null);
  const longPressRef = useRef<{ timer: ReturnType<typeof setTimeout>; fired: boolean } | null>(null);

  useDeckFrame(deck, (snapshot) => {
    const el = playingIndicatorRef.current;
    if (el) el.style.opacity = snapshot.playing ? "1" : "0.15";
  });

  const handleFile = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      setLoading(true);
      try {
        const client = await connect();
        const buffer = await file.arrayBuffer();
        const decoded = await client.decode(buffer);
        // BPM, key (Camelot code) and the waveform are all measured
        // off the main thread.
        const { bpm, key, peaks } = await analyzeTrack(decoded.getChannelData(0), decoded.sampleRate);
        client.loadDecodedTrack(deck, decoded, bpm);
        const id = `${file.name}-${file.lastModified}`;
        // The same file loaded before (same name + mtime => same id) may
        // already carry hot cues from a previous session — restore them
        // rather than starting blank.
        const existing = await db.tracks.get(id);
        const meta = {
          id,
          title: file.name.replace(/\.[^.]+$/, ""),
          artist: "",
          bpm,
          key,
          durationSeconds: decoded.duration,
          waveform: peaks,
        };
        loadTrack(deck, meta, existing?.cues ?? [], existing?.mainCue ?? 0);
        // Persisted locally (IndexedDB) so it survives a reload — the audio
        // blob never leaves the device.
        void db.tracks.put({
          ...meta,
          audio: file,
          cues: existing?.cues ?? [],
          mainCue: existing?.mainCue ?? 0,
          addedAt: existing?.addedAt ?? Date.now(),
          updatedAt: Date.now(),
        });
      } finally {
        setLoading(false);
        e.target.value = "";
      }
    },
    [analyzeTrack, connect, deck, loadTrack],
  );

  /** The engine's own state. The UI store's play flag can be stale — e.g.
   * after a track runs off its end, the worklet stops but nothing told the
   * UI — so decisions about playback read the engine, the source of truth. */
  const readEngine = useCallback(
    (client: NonNullable<typeof engine>) => {
      const snapshot = emptySnapshot();
      client.reader(deck).read(snapshot);
      return snapshot;
    },
    [deck],
  );

  const handlePlay = useCallback(async () => {
    const client = engine ?? (await connect());
    // PLAY while holding CUE: keep playing after CUE is released (CDJ).
    if (cuePreviewRef.current !== null) {
      cuePreviewRef.current = null;
      setCue(deck, false);
      setPlaying(deck, true);
      return;
    }
    const playing = readEngine(client).playing;
    if (playing) client.pause(deck);
    else client.play(deck);
    setPlaying(deck, !playing);
  }, [connect, deck, engine, readEngine, setCue, setPlaying]);

  // TrackReader's loop wrap math assumes the playhead only ever moves inside
  // the loop or by normal playback — an arbitrary seek while a loop is
  // active produces a garbled position (see packages/dsp/src/kernels/
  // resampler.ts). Any manual jump exits the loop first, which also matches
  // what a CDJ/Traktor does when you hit a cue point while looping.
  const exitLoopIfActive = useCallback(
    (client: NonNullable<typeof engine>) => {
      if (state.loopLengthBeats === null) return;
      client.clearLoop(deck);
      setLoopLength(deck, null);
    },
    [deck, setLoopLength, state.loopLengthBeats],
  );

  const handleCueDown = useCallback(async () => {
    if (!state.track) return;
    const client = engine ?? (await connect());
    const snapshot = readEngine(client);
    const press = pressCue(snapshot.playing, snapshot.playheadFrames, state.cuePoint);
    exitLoopIfActive(client);

    if (press.kind === "return-and-stop") {
      client.pause(deck);
      client.seek(deck, press.cuePoint);
      setPlaying(deck, false);
      return;
    }
    if (press.cuePointChanged) {
      setCuePoint(deck, press.cuePoint);
      void db.tracks.update(state.track.id, { mainCue: press.cuePoint, updatedAt: Date.now() });
    }
    // Held: preview from the cue point until release.
    cuePreviewRef.current = press.cuePoint;
    client.seek(deck, press.cuePoint);
    client.play(deck);
    setCue(deck, true);
  }, [
    connect,
    deck,
    engine,
    exitLoopIfActive,
    readEngine,
    setCue,
    setCuePoint,
    setPlaying,
    state.cuePoint,
    state.track,
  ]);

  const handleCueUp = useCallback(() => {
    const cuePoint = cuePreviewRef.current;
    if (!engine || cuePoint === null) return;
    cuePreviewRef.current = null;
    exitLoopIfActive(engine);
    engine.pause(deck);
    engine.seek(deck, cuePoint);
    setCue(deck, false);
  }, [deck, engine, exitLoopIfActive, setCue]);

  const handleSync = useCallback(async () => {
    const enabling = !state.syncEnabled;
    toggleSync(deck);
    if (!enabling) return;
    const other = decksStore.getState().decks[otherDeck];
    if (!other.track || !state.track) return; // nothing loaded to sync to

    const ownRate = 1 + state.tempoPercent / 100;
    const targetBpm = other.track.bpm * (1 + other.tempoPercent / 100);
    const rate = syncRate(targetBpm, state.track.bpm, ownRate);
    const percent = clampTempoPercent(ratioToTempoPercent(rate));

    setTempo(deck, percent);
    const client = engine ?? (await connect());
    client.setRate(deck, 1 + percent / 100);
  }, [connect, deck, engine, otherDeck, setTempo, state, toggleSync]);

  // A BPM control, not a pitch control: it retimes the deck (see
  // TimeStretcher / DeckMessage's "rate") without shifting pitch.
  const handleTempo = useCallback(
    (v: number) => {
      const percent = v * 8; // +-8% range, the mixer-standard default
      setTempo(deck, percent);
      engine?.setRate(deck, 1 + percent / 100);
    },
    [deck, engine, setTempo],
  );

  const deleteHotCue = useCallback(
    (index: number) => {
      clearHotCue(deck, index);
      if (state.track) {
        const cues = state.hotCues.filter((c) => c.index !== index);
        void db.tracks.update(state.track.id, { cues, updatedAt: Date.now() });
      }
    },
    [clearHotCue, deck, state.hotCues, state.track],
  );

  // Long-press (touch) deletes a set hot cue — the touch stand-in for
  // Traktor's Shift+pad. The click that ends a long-press is swallowed so it
  // doesn't immediately set the pad again.
  const startLongPress = useCallback(
    (index: number) => {
      if (!state.hotCues.some((c) => c.index === index)) return;
      const press = { fired: false, timer: setTimeout(() => undefined, 0) };
      press.timer = setTimeout(() => {
        press.fired = true;
        deleteHotCue(index);
        navigator.vibrate?.(15);
      }, 550);
      longPressRef.current = press;
    },
    [deleteHotCue, state.hotCues],
  );

  const cancelLongPress = useCallback(() => {
    if (longPressRef.current) clearTimeout(longPressRef.current.timer);
  }, []);

  const handleHotCue = useCallback(
    async (index: number) => {
      const existing = state.hotCues.find((c) => c.index === index);
      const client = engine ?? (await connect());
      if (existing) {
        exitLoopIfActive(client);
        client.seek(deck, existing.frame);
        client.play(deck);
        setPlaying(deck, true);
        return;
      }
      const snapshot = emptySnapshot();
      client.reader(deck).read(snapshot);
      const cue = { index, frame: snapshot.playheadFrames, color: HOT_CUE_COLORS[index] ?? "#ffffff" };
      setHotCue(deck, cue);
      if (state.track) {
        const cues = [...state.hotCues.filter((c) => c.index !== index), cue];
        void db.tracks.update(state.track.id, { cues, updatedAt: Date.now() });
      }
    },
    [connect, deck, engine, exitLoopIfActive, setHotCue, setPlaying, state.hotCues, state.track],
  );

  useDeckKeys(deck, {
    cueDown: () => void handleCueDown(),
    cueUp: handleCueUp,
    play: () => void handlePlay(),
    sync: () => void handleSync(),
    hotCue: (index) => void handleHotCue(index),
  });

  const trackFrames = state.track
    ? state.track.durationSeconds * (engine?.sampleRate ?? 48000)
    : 0;
  const waveformMarkers: WaveformMarker[] =
    trackFrames > 0
      ? [
          { position: state.cuePoint / trackFrames, color: "#e8e6e1", label: "C" },
          ...state.hotCues.map((c) => ({
            position: c.frame / trackFrames,
            color: c.color,
            label: String(c.index + 1),
          })),
        ]
      : [];

  const handleSeek = async (position: number) => {
    if (!state.track || trackFrames <= 0) return;
    const client = engine ?? (await connect());
    exitLoopIfActive(client);
    client.seek(deck, position * trackFrames);
  };

  return (
    <div className="panel-surface flex flex-col gap-3 rounded-xl border border-deck-border p-4 shadow-panel landscape:gap-2 landscape:p-2 lg:gap-3 lg:p-4">
      <div className="flex items-center justify-between">
        <span className="text-sm font-bold tracking-widest text-neutral-300">DECK {deck}</span>
        <span className="hidden text-[9px] text-neutral-600 lg:inline">{DECK_KEY_HINTS[deck]}</span>
        <div
          ref={playingIndicatorRef}
          className="h-2 w-2 rounded-full bg-accent-hot transition-opacity"
          style={{ opacity: 0.15 }}
        />
      </div>

      <TimeDisplay deck={deck} />

      <Waveform
        deck={deck}
        peaks={state.track?.waveform ?? null}
        markers={waveformMarkers}
        onSeek={(position) => void handleSeek(position)}
      />

      <div className="flex items-center justify-center py-1">
        <JogWheel deck={deck} />
      </div>

      <div className="flex flex-col gap-1">
        <span className="text-[9px] font-medium uppercase tracking-wide text-neutral-500">
          Hot Cues
        </span>
        <div className="grid grid-cols-4 gap-1.5">
          {[0, 1, 2, 3].map((index) => {
            const cue = state.hotCues.find((c) => c.index === index);
            return (
              <button
                key={index}
                type="button"
                className={cx(
                  "h-11 rounded-sm border text-xs font-bold uppercase",
                  cue ? "border-transparent text-black" : "border-deck-border text-neutral-500",
                )}
                style={cue ? { backgroundColor: cue.color, WebkitTouchCallout: "none" } : undefined}
                onPointerDown={() => startLongPress(index)}
                onPointerUp={cancelLongPress}
                onPointerLeave={cancelLongPress}
                onClick={() => {
                  if (longPressRef.current?.fired) {
                    longPressRef.current = null;
                    return;
                  }
                  void handleHotCue(index);
                }}
                onContextMenu={(e) => {
                  // Right-click (desktop) deletes; also stops the phone's
                  // long-press menu from covering the pads.
                  e.preventDefault();
                  if (cue) deleteHotCue(index);
                }}
                title={cue ? "Tap to jump · long-press or right-click to delete" : "Tap to set a hot cue here"}
              >
                {index + 1}
              </button>
            );
          })}
        </div>
      </div>

      <LoopControls deck={deck} />

      <div className="flex items-center gap-2">
        <button
          type="button"
          className="flex-1 rounded-md border border-deck-border bg-panel-raised py-3 text-xs font-bold uppercase text-neutral-200 active:bg-neutral-700"
          onPointerDown={() => void handleCueDown()}
          onPointerUp={handleCueUp}
          onPointerLeave={handleCueUp}
        >
          Cue
        </button>
        <button
          type="button"
          className={cx(
            "flex-[2] rounded-md py-3 text-xs font-bold uppercase",
            state.playRequested
              ? "bg-accent text-black"
              : "border border-deck-border bg-panel-raised text-neutral-200",
          )}
          onClick={() => void handlePlay()}
        >
          {state.playRequested ? "Pause" : "Play"}
        </button>
        <button
          type="button"
          className={cx(
            "flex-1 rounded-md border py-3 text-xs font-bold uppercase",
            state.syncEnabled
              ? "border-transparent bg-green-500 text-black"
              : "border-deck-border bg-panel-raised text-neutral-200",
          )}
          onClick={() => void handleSync()}
          title="Match this deck's tempo to the other deck's BPM."
        >
          Sync
        </button>
      </div>

      <div className="flex items-center justify-between gap-4">
        <button
          type="button"
          className="rounded-md border border-deck-border bg-panel-raised px-3 py-2 text-[11px] font-semibold uppercase text-neutral-300 disabled:opacity-50"
          onClick={() => fileInputRef.current?.click()}
          disabled={loading}
        >
          {loading ? "Loading…" : "Load Track"}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="audio/*"
          className="hidden"
          onChange={(e) => void handleFile(e)}
        />
        <Slider
          value={state.tempoPercent / 8}
          onChange={handleTempo}
          bipolar
          height={90}
          label={state.track ? `${(state.track.bpm * (1 + state.tempoPercent / 100)).toFixed(1)} BPM` : "BPM"}
        />
      </div>
    </div>
  );
}
