"use client";

import { useCallback, useRef, useState } from "react";
import { useStore } from "zustand/react";
import { decksStore, syncRate, clampPitchPercent, rateToPitchPercent } from "@cuepoint/engine";
import type { DeckId } from "@cuepoint/engine";
import { emptySnapshot } from "@cuepoint/dsp";
import { db } from "@cuepoint/library";
import { useEngine } from "@/lib/engine-provider";
import { useDeckFrame } from "@/hooks/useDeckFrame";
import { JogWheel } from "./JogWheel";
import { Waveform } from "./Waveform";
import { TimeDisplay } from "./TimeDisplay";
import { Slider } from "./Slider";
import { cx } from "@/lib/cx";

const HOT_CUE_COLORS = ["#ff5a3c", "#ffb020", "#35d07f", "#4aa8ff"];

export function DeckPanel({ deck }: { deck: DeckId }) {
  const otherDeck: DeckId = deck === "A" ? "B" : "A";
  const { engine, connect, analyzeTrack } = useEngine();
  const state = useStore(decksStore, (s) => s.decks[deck]);
  const setPitch = useStore(decksStore, (s) => s.setPitch);
  const togglePlay = useStore(decksStore, (s) => s.togglePlay);
  const toggleSync = useStore(decksStore, (s) => s.toggleSync);
  const setCue = useStore(decksStore, (s) => s.setCue);
  const loadTrack = useStore(decksStore, (s) => s.loadTrack);
  const setHotCue = useStore(decksStore, (s) => s.setHotCue);
  const setPlaying = useStore(decksStore, (s) => s.setPlaying);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [loading, setLoading] = useState(false);
  const playingIndicatorRef = useRef<HTMLDivElement | null>(null);

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
        // Key detection is stubbed (see packages/analysis); BPM and the
        // waveform are real, computed off the main thread.
        const { bpm, peaks } = await analyzeTrack(decoded.getChannelData(0), decoded.sampleRate);
        client.loadDecodedTrack(deck, decoded, bpm);
        const id = `${file.name}-${file.lastModified}`;
        const meta = {
          id,
          title: file.name.replace(/\.[^.]+$/, ""),
          artist: "",
          bpm,
          key: "--",
          durationSeconds: decoded.duration,
          waveform: peaks,
        };
        loadTrack(deck, meta);
        // Persisted locally (IndexedDB) so it survives a reload — the audio
        // blob never leaves the device.
        void db.tracks.put({ ...meta, audio: file, addedAt: Date.now() });
      } finally {
        setLoading(false);
        e.target.value = "";
      }
    },
    [analyzeTrack, connect, deck, loadTrack],
  );

  const handlePlay = useCallback(async () => {
    const client = engine ?? (await connect());
    if (state.playRequested) client.pause(deck);
    else client.play(deck);
    togglePlay(deck);
  }, [connect, deck, engine, state.playRequested, togglePlay]);

  const handleCueDown = useCallback(async () => {
    const client = engine ?? (await connect());
    client.seek(deck, 0);
    client.play(deck);
    setCue(deck, true);
  }, [connect, deck, engine, setCue]);

  const handleCueUp = useCallback(() => {
    engine?.pause(deck);
    engine?.seek(deck, 0);
    setCue(deck, false);
  }, [deck, engine, setCue]);

  const handleSync = useCallback(async () => {
    const enabling = !state.syncEnabled;
    toggleSync(deck);
    if (!enabling) return;
    const other = decksStore.getState().decks[otherDeck];
    if (!other.track || !state.track) return; // nothing loaded to sync to

    const ownRate = 1 + state.pitchPercent / 100;
    const targetBpm = other.track.bpm * (1 + other.pitchPercent / 100);
    const rate = syncRate(targetBpm, state.track.bpm, ownRate);
    const percent = clampPitchPercent(rateToPitchPercent(rate));

    setPitch(deck, percent);
    const client = engine ?? (await connect());
    client.setRate(deck, 1 + percent / 100);
  }, [connect, deck, engine, otherDeck, setPitch, state, toggleSync]);

  const handlePitch = useCallback(
    (v: number) => {
      const percent = v * 8; // +-8% range, the mixer-standard default
      setPitch(deck, percent);
      engine?.setRate(deck, 1 + percent / 100);
    },
    [deck, engine, setPitch],
  );

  const handleHotCue = useCallback(
    async (index: number) => {
      const existing = state.hotCues.find((c) => c.index === index);
      const client = engine ?? (await connect());
      if (existing) {
        client.seek(deck, existing.frame);
        client.play(deck);
        setPlaying(deck, true);
        return;
      }
      const snapshot = emptySnapshot();
      client.reader(deck).read(snapshot);
      setHotCue(deck, {
        index,
        frame: snapshot.playheadFrames,
        color: HOT_CUE_COLORS[index] ?? "#ffffff",
      });
    },
    [connect, deck, engine, setHotCue, setPlaying, state.hotCues],
  );

  return (
    <div className="panel-surface flex flex-col gap-3 rounded-xl border border-deck-border p-4 shadow-panel">
      <div className="flex items-center justify-between">
        <span className="text-sm font-bold tracking-widest text-neutral-300">DECK {deck}</span>
        <div
          ref={playingIndicatorRef}
          className="h-2 w-2 rounded-full bg-accent-hot transition-opacity"
          style={{ opacity: 0.15 }}
        />
      </div>

      <TimeDisplay deck={deck} />

      <Waveform deck={deck} peaks={state.track?.waveform ?? null} />

      <div className="flex items-center justify-center py-1">
        <JogWheel deck={deck} />
      </div>

      <div className="grid grid-cols-4 gap-1.5">
        {[0, 1, 2, 3].map((index) => {
          const cue = state.hotCues.find((c) => c.index === index);
          return (
            <button
              key={index}
              type="button"
              className={cx(
                "h-8 rounded-sm border text-[10px] font-bold uppercase",
                cue ? "border-transparent text-black" : "border-deck-border text-neutral-500",
              )}
              style={cue ? { backgroundColor: cue.color } : undefined}
              onClick={() => void handleHotCue(index)}
            >
              {index + 1}
            </button>
          );
        })}
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          className="flex-1 rounded-md border border-deck-border bg-panel-raised py-2 text-xs font-bold uppercase text-neutral-200 active:bg-neutral-700"
          onPointerDown={() => void handleCueDown()}
          onPointerUp={handleCueUp}
          onPointerLeave={handleCueUp}
        >
          Cue
        </button>
        <button
          type="button"
          className={cx(
            "flex-[2] rounded-md py-2 text-xs font-bold uppercase",
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
            "flex-1 rounded-md border py-2 text-xs font-bold uppercase",
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
        <Slider value={state.pitchPercent / 8} onChange={handlePitch} bipolar height={90} label="Pitch" />
      </div>
    </div>
  );
}
