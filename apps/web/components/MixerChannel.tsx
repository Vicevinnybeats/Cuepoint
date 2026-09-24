"use client";

import { useCallback } from "react";
import { useStore } from "zustand/react";
import { decksStore } from "@cuepoint/engine";
import type { DeckId } from "@cuepoint/engine";
import type { CrossfaderAssign } from "@cuepoint/dsp/kernels";
import { useEngine } from "@/lib/engine-provider";
import { Knob } from "./Knob";
import { Slider } from "./Slider";
import { LevelMeter } from "./LevelMeter";
import { cx } from "@/lib/cx";

/** Trim gain goes from 0 to 1.5x so the knob's centre detent is unity. */
const GAIN_RANGE = 1.5;

const ASSIGNS: Array<{ id: CrossfaderAssign; label: string }> = [
  { id: "A", label: "A" },
  { id: "thru", label: "Thru" },
  { id: "B", label: "B" },
];

export function MixerChannel({ deck }: { deck: DeckId }) {
  const { engine } = useEngine();
  const state = useStore(decksStore, (s) => s.decks[deck]);
  const assign = useStore(decksStore, (s) => s.mixer.crossfaderAssign[deck]);
  const setEq = useStore(decksStore, (s) => s.setEq);
  const setFilter = useStore(decksStore, (s) => s.setFilter);
  const setGain = useStore(decksStore, (s) => s.setGain);
  const setFader = useStore(decksStore, (s) => s.setFader);
  const setCrossfaderAssign = useStore(decksStore, (s) => s.setCrossfaderAssign);

  const handleAssign = useCallback(
    (value: CrossfaderAssign) => {
      setCrossfaderAssign(deck, value);
      engine?.setCrossfaderAssign(deck, value);
    },
    [deck, engine, setCrossfaderAssign],
  );

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

  const assignIndex = ASSIGNS.findIndex((a) => a.id === assign);

  return (
    <div className="panel-surface flex flex-col items-center gap-3 rounded-xl border border-deck-border p-3 shadow-panel landscape:gap-2 landscape:p-2 lg:gap-3 lg:p-3">
      <span className="text-xs font-bold tracking-widest text-neutral-400">{deck}</span>
      <Knob
        value={state.gain / GAIN_RANGE}
        onChange={handleGain}
        label="Gain"
        resetValue={1 / GAIN_RANGE}
      />
      <div className="flex flex-col gap-2">
        <Knob value={state.eqHigh} onChange={(v) => handleEq("eqHigh", v)} label="Hi" />
        <Knob value={state.eqMid} onChange={(v) => handleEq("eqMid", v)} label="Mid" />
        <Knob value={state.eqLow} onChange={(v) => handleEq("eqLow", v)} label="Low" />
      </div>
      <Knob value={state.filter} onChange={handleFilter} bipolar label="Filter" accent="text-accent" />
      <div className="flex items-end gap-2">
        <LevelMeter target={deck} height={140} />
        <Slider
          value={state.faderLevel}
          onChange={handleFader}
          height={140}
          label="Level"
          resetValue={1}
          ticks={10}
        />
      </div>

      {/* Hardware-style 3-position switch — a single track with a thumb
          that snaps to A / Thru / B, rather than 3 separate buttons. */}
      <div className="flex flex-col items-center gap-1">
        <div
          className="relative flex h-6 w-24 items-center rounded-full border border-deck-border bg-panel-sunken"
          role="group"
          aria-label={`Deck ${deck} crossfader assign`}
        >
          <div
            className="pointer-events-none absolute top-0.5 h-5 w-1/3 rounded-full bg-amber shadow-md transition-[left] duration-150"
            style={{ left: `calc(${assignIndex * (100 / 3)}% + 2px)`, width: "calc(33.33% - 4px)" }}
          />
          {ASSIGNS.map(({ id, label }) => (
            <button
              key={id}
              type="button"
              onClick={() => handleAssign(id)}
              className={cx(
                "relative z-10 flex-1 text-[9px] font-bold uppercase",
                assign === id ? "text-black" : "text-neutral-400",
              )}
              title={`Assign deck ${deck} to the crossfader's ${label} side`}
            >
              {label}
            </button>
          ))}
        </div>
        <span className="text-[8px] font-medium uppercase tracking-wide text-neutral-600">
          X-Fader Assign
        </span>
      </div>
    </div>
  );
}
