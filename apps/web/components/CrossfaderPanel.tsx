"use client";

import { useCallback } from "react";
import { useStore } from "zustand/react";
import { decksStore } from "@cuepoint/engine";
import type { CrossfaderCurve } from "@cuepoint/dsp/kernels";
import { useEngine } from "@/lib/engine-provider";
import { Crossfader } from "./Crossfader";
import { cx } from "@/lib/cx";

const CURVES: Array<{ id: CrossfaderCurve; label: string }> = [
  { id: "linear", label: "Linear" },
  { id: "constant-power", label: "Power" },
  { id: "sharp", label: "Sharp" },
];

/** The fourth mixer panel in the strip (channel A / master / crossfader /
 * channel B) — split out from MasterSection so it reads as its own block
 * rather than being buried under the master knob. */
export function CrossfaderPanel() {
  const { engine } = useEngine();
  const mixer = useStore(decksStore, (s) => s.mixer);
  const setCrossfader = useStore(decksStore, (s) => s.setCrossfader);
  const setCrossfaderCurve = useStore(decksStore, (s) => s.setCrossfaderCurve);

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

  return (
    <div className="panel-surface flex flex-col items-center gap-2 rounded-xl border border-deck-border p-3 shadow-panel landscape:gap-1 landscape:p-1.5 lg:landscape:gap-3 lg:landscape:p-3 lg:gap-3 lg:p-3">
      <span className="text-xs font-bold tracking-widest text-neutral-400 landscape:text-[10px] lg:landscape:text-xs">
        CROSSFADER
      </span>
      <div className="flex gap-1">
        {CURVES.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            onClick={() => handleCurve(id)}
            className={cx(
              "min-h-9 rounded-sm border px-2 py-1.5 text-[10px] font-semibold uppercase landscape:min-h-5 landscape:px-1 landscape:py-0.5 landscape:text-[7px] lg:landscape:min-h-9 lg:landscape:px-2 lg:landscape:py-1.5 lg:landscape:text-[10px]",
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
