"use client";

import { useCallback } from "react";
import { useStore } from "zustand/react";
import { decksStore } from "@cuepoint/engine";
import type { DeckId } from "@cuepoint/engine";
import { useEngine } from "@/lib/engine-provider";
import { Knob } from "./Knob";
import { Slider } from "./Slider";
import { LevelMeter } from "./LevelMeter";

/** Trim gain goes from 0 to 1.5x so the knob's centre detent is unity. */
const GAIN_RANGE = 1.5;

export function MixerChannel({ deck }: { deck: DeckId }) {
  const { engine } = useEngine();
  const state = useStore(decksStore, (s) => s.decks[deck]);
  const setEq = useStore(decksStore, (s) => s.setEq);
  const setFilter = useStore(decksStore, (s) => s.setFilter);
  const setGain = useStore(decksStore, (s) => s.setGain);
  const setFader = useStore(decksStore, (s) => s.setFader);

  const handleEq = useCallback(
    (band: "eqLow" | "eqMid" | "eqHigh", value: number) => {
      setEq(deck, band, value);
      const next = { ...state, [band]: value };
      engine?.setEq(deck, next.eqLow, next.eqMid, next.eqHigh);
    },
    [deck, engine, setEq, state],
  );

  const handleFilter = useCallback(
    (value: number) => {
      setFilter(deck, value);
      engine?.setFilter(deck, value);
    },
    [deck, engine, setFilter],
  );

  const handleGain = useCallback(
    (value: number) => {
      const linear = value * GAIN_RANGE;
      setGain(deck, linear);
      engine?.setGain(deck, linear);
    },
    [deck, engine, setGain],
  );

  const handleFader = useCallback(
    (value: number) => {
      setFader(deck, value);
      engine?.setFader(deck, value);
    },
    [deck, engine, setFader],
  );

  return (
    <div className="panel-surface flex flex-col items-center gap-3 rounded-xl border border-deck-border p-3 shadow-panel">
      <span className="text-xs font-bold tracking-widest text-neutral-400">{deck}</span>
      <Knob value={state.gain / GAIN_RANGE} onChange={handleGain} label="Gain" />
      <div className="flex flex-col gap-2">
        <Knob value={state.eqHigh} onChange={(v) => handleEq("eqHigh", v)} label="Hi" />
        <Knob value={state.eqMid} onChange={(v) => handleEq("eqMid", v)} label="Mid" />
        <Knob value={state.eqLow} onChange={(v) => handleEq("eqLow", v)} label="Low" />
      </div>
      <Knob value={state.filter} onChange={handleFilter} bipolar label="Filter" accent="text-accent" />
      <div className="flex items-end gap-2">
        <LevelMeter target={deck} height={140} />
        <Slider value={state.faderLevel} onChange={handleFader} height={140} label="Level" />
      </div>
    </div>
  );
}
