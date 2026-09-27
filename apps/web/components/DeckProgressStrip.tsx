"use client";

import { useRef } from "react";
import { useStore } from "zustand/react";
import { decksStore } from "@cuepoint/engine";
import type { DeckId } from "@cuepoint/engine";
import { useDeckFrame } from "@/hooks/useDeckFrame";

/** Always in this order — "A through D" — regardless of how the decks are
 * paired up (A/C left, B/D right) in the main grid below. */
const DECKS: DeckId[] = ["A", "B", "C", "D"];

const DECK_COLORS: Record<DeckId, string> = {
  A: "#ffb020",
  B: "#4aa8ff",
  C: "#35d07f",
  D: "#ff5a3c",
};

function DeckProgressBar({ deck }: { deck: DeckId }) {
  const barRef = useRef<HTMLDivElement | null>(null);
  const track = useStore(decksStore, (s) => s.decks[deck].track);

  useDeckFrame(deck, (snapshot) => {
    const percent =
      snapshot.trackFrames > 0 ? (snapshot.playheadFrames / snapshot.trackFrames) * 100 : 0;
    const el = barRef.current;
    if (el) el.style.width = `${Math.min(Math.max(percent, 0), 100)}%`;
  });

  return (
    <div className="flex flex-1 items-center gap-1.5">
      <span className="w-3 shrink-0 text-[9px] font-bold text-neutral-500 lg:w-4 lg:text-sm">{deck}</span>
      <div className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-panel-sunken lg:h-2">
        <div
          ref={barRef}
          className="absolute inset-y-0 left-0 rounded-full transition-[width]"
          style={{ width: "0%", backgroundColor: DECK_COLORS[deck] }}
        />
      </div>
      {!track && <span className="shrink-0 text-[8px] text-neutral-700 lg:text-xs">empty</span>}
    </div>
  );
}

/** One glance at all 4 decks' playback progress, in a fixed A→D order —
 * the per-deck waveform elsewhere shows one track's detail, this shows how
 * far along all four are relative to each other. */
export function DeckProgressStrip() {
  return (
    <div className="flex items-center gap-4 rounded-md border border-deck-border bg-panel-sunken px-3 py-1.5 lg:px-4 lg:py-2.5 2xl:landscape:py-3">
      {DECKS.map((deck) => (
        <DeckProgressBar key={deck} deck={deck} />
      ))}
    </div>
  );
}
