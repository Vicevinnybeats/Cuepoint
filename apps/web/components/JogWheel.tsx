"use client";

import { useRef } from "react";
import { useDeckFrame } from "@/hooks/useDeckFrame";
import { useEngine } from "@/lib/engine-provider";
import type { DeckId } from "@cuepoint/engine";

/** 33 1/3 RPM, the turntable standard most jogwheels emulate. */
const DEG_PER_SECOND = (100 / 3 / 60) * 360;

export function JogWheel({ deck }: { deck: DeckId }) {
  const platterRef = useRef<HTMLDivElement | null>(null);
  const { engine } = useEngine();

  useDeckFrame(deck, (snapshot) => {
    // Frames only flow once the engine exists, so the fallback never applies.
    const seconds = snapshot.playheadFrames / (engine?.sampleRate ?? 48000);
    const angle = (seconds * DEG_PER_SECOND) % 360;
    const el = platterRef.current;
    if (el) el.style.transform = `rotate(${angle}deg)`;
  });

  return (
    // Sized responsively rather than by a fixed pixel prop: comfortably
    // large on a portrait phone, smaller in landscape (where vertical space
    // is the scarce dimension, not screen width), largest on desktop.
    <div className="relative flex h-48 w-48 items-center justify-center rounded-full border-4 border-deck-border bg-panel-sunken shadow-panel landscape:h-9 landscape:w-9 landscape:border lg:landscape:border-4 sm:h-52 sm:w-52 lg:landscape:h-56 lg:landscape:w-56 lg:h-56 lg:w-56">
      <div
        ref={platterRef}
        className="absolute inset-3 rounded-full landscape:inset-0.5 lg:landscape:inset-3"
        style={{
          backgroundImage: "repeating-conic-gradient(#232326 0deg 2deg, #19191c 2deg 8deg)",
        }}
      >
        <div className="absolute left-1/2 top-2 h-4 w-1 -translate-x-1/2 rounded-full bg-amber landscape:top-0 landscape:h-1 landscape:w-0.5 lg:landscape:top-2 lg:landscape:h-4 lg:landscape:w-1" />
      </div>
      <div className="absolute flex h-14 w-14 items-center justify-center rounded-full border border-deck-border bg-panel landscape:h-3 landscape:w-3 lg:landscape:h-14 lg:landscape:w-14">
        <div className="h-2 w-2 rounded-full bg-neutral-600 landscape:h-0.5 landscape:w-0.5 lg:landscape:h-2 lg:landscape:w-2" />
      </div>
    </div>
  );
}
