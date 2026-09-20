"use client";

import { useRef } from "react";
import { useDeckFrame } from "@/hooks/useDeckFrame";
import type { DeckId } from "@cuepoint/engine";

/**
 * The shared-state protocol carries the playhead in frames but not the
 * engine's actual AudioContext sample rate. Assuming the common default
 * only skews the platter's visual spin speed on a context that negotiated a
 * different rate — audio playback itself is unaffected, since that runs off
 * the real sample rate inside the worklet.
 */
const ASSUMED_SAMPLE_RATE = 48000;
/** 33 1/3 RPM, the turntable standard most jogwheels emulate. */
const DEG_PER_SECOND = (100 / 3 / 60) * 360;

export function JogWheel({ deck, size = 200 }: { deck: DeckId; size?: number }) {
  const platterRef = useRef<HTMLDivElement | null>(null);

  useDeckFrame(deck, (snapshot) => {
    const seconds = snapshot.playheadFrames / ASSUMED_SAMPLE_RATE;
    const angle = (seconds * DEG_PER_SECOND) % 360;
    const el = platterRef.current;
    if (el) el.style.transform = `rotate(${angle}deg)`;
  });

  return (
    <div
      className="relative flex items-center justify-center rounded-full border-4 border-deck-border bg-panel-sunken shadow-panel"
      style={{ width: size, height: size }}
    >
      <div
        ref={platterRef}
        className="absolute inset-3 rounded-full"
        style={{
          backgroundImage: "repeating-conic-gradient(#232326 0deg 2deg, #19191c 2deg 8deg)",
        }}
      >
        <div className="absolute left-1/2 top-2 h-4 w-1 -translate-x-1/2 rounded-full bg-amber" />
      </div>
      <div className="absolute flex h-14 w-14 items-center justify-center rounded-full border border-deck-border bg-panel">
        <div className="h-2 w-2 rounded-full bg-neutral-600" />
      </div>
    </div>
  );
}
