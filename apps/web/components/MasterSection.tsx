"use client";

import { useCallback } from "react";
import { useStore } from "zustand/react";
import { decksStore } from "@cuepoint/engine";
import { useEngine } from "@/lib/engine-provider";
import { useCompactLayout } from "@/hooks/useCompactLayout";
import { Knob } from "./Knob";
import { LevelMeter } from "./LevelMeter";

/** Master gain goes to 1.2x so unity sits below the top of the knob's travel. */
const MASTER_GAIN_RANGE = 1.2;

export function MasterSection() {
  const compact = useCompactLayout();
  const { engine } = useEngine();
  const mixer = useStore(decksStore, (s) => s.mixer);
  const setMasterGain = useStore(decksStore, (s) => s.setMasterGain);

  const handleMasterGain = useCallback(
    (value: number) => {
      const linear = value * MASTER_GAIN_RANGE;
      setMasterGain(linear);
      engine?.setMasterGain(linear);
    },
    [engine, setMasterGain],
  );

  return (
    <div className="panel-surface flex flex-col items-center gap-2 rounded-xl border border-deck-border p-3 shadow-panel landscape:gap-0.5 landscape:p-1 lg:landscape:gap-4 lg:landscape:p-3 lg:gap-4 lg:p-3">
      <span className="text-xs font-bold tracking-widest text-neutral-400 landscape:text-[9px] lg:landscape:text-xs">
        MASTER
      </span>
      <LevelMeter target="master" height={compact ? 30 : 100} />
      <Knob
        value={mixer.masterGain / MASTER_GAIN_RANGE}
        onChange={handleMasterGain}
        label="Master"
        accent="text-accent"
        resetValue={1 / MASTER_GAIN_RANGE}
        size={compact ? 20 : 44}
      />
    </div>
  );
}
