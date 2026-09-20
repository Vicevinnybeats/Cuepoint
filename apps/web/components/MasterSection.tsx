"use client";

import { useCallback } from "react";
import { useStore } from "zustand/react";
import { decksStore } from "@cuepoint/engine";
import type { CrossfaderCurve } from "@cuepoint/dsp/kernels";
import { useEngine } from "@/lib/engine-provider";
import { Knob } from "./Knob";
import { Crossfader } from "./Crossfader";
import { LevelMeter } from "./LevelMeter";
import { cx } from "@/lib/cx";

const CURVES: Array<{ id: CrossfaderCurve; label: string }> = [
  { id: "linear", label: "Linear" },
  { id: "constant-power", label: "Power" },
  { id: "sharp", label: "Sharp" },
];

/** Master gain goes to 1.2x so unity sits below the top of the knob's travel. */
const MASTER_GAIN_RANGE = 1.2;

export function MasterSection() {
  const { engine } = useEngine();
  const mixer = useStore(decksStore, (s) => s.mixer);
  const setCrossfader = useStore(decksStore, (s) => s.setCrossfader);
  const setCrossfaderCurve = useStore(decksStore, (s) => s.setCrossfaderCurve);
  const setMasterGain = useStore(decksStore, (s) => s.setMasterGain);

  const handleCrossfader = useCallback(
    (value: number) => {
      setCrossfader(value);
      engine?.setCrossfader(value);
    },
    [engine, setCrossfader],
  );

  const handleCurve = useCallback(
    (curve: CrossfaderCurve) => {
      setCrossfaderCurve(curve);
      engine?.setCrossfaderCurve(curve);
    },
    [engine, setCrossfaderCurve],
  );

  const handleMasterGain = useCallback(
    (value: number) => {
      const linear = value * MASTER_GAIN_RANGE;
      setMasterGain(linear);
      engine?.setMasterGain(linear);
    },
    [engine, setMasterGain],
  );

  return (
    <div className="panel-surface flex flex-col items-center gap-4 rounded-xl border border-deck-border p-3 shadow-panel">
      <span className="text-xs font-bold tracking-widest text-neutral-400">MASTER</span>
      <LevelMeter target="master" height={100} />
      <Knob
        value={mixer.masterGain / MASTER_GAIN_RANGE}
        onChange={handleMasterGain}
        label="Master"
        accent="text-accent"
      />
      <div className="flex gap-1">
        {CURVES.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            onClick={() => handleCurve(id)}
            className={cx(
              "min-h-9 rounded-sm border px-2 py-1.5 text-[10px] font-semibold uppercase",
              mixer.crossfaderCurve === id
                ? "border-transparent bg-amber text-black"
                : "border-deck-border text-neutral-400",
            )}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="w-full max-w-xs">
        <Crossfader value={mixer.crossfaderPosition} onChange={handleCrossfader} />
      </div>
    </div>
  );
}
