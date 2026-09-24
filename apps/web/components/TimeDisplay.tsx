"use client";

import { useRef } from "react";
import { useStore } from "zustand/react";
import { decksStore } from "@cuepoint/engine";
import type { DeckId } from "@cuepoint/engine";
import { useDeckFrame } from "@/hooks/useDeckFrame";
import { useEngine } from "@/lib/engine-provider";

function formatTime(totalSeconds: number): string {
  const clamped = Number.isFinite(totalSeconds) && totalSeconds > 0 ? totalSeconds : 0;
  const minutes = Math.floor(clamped / 60);
  const seconds = Math.floor(clamped % 60);
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

export function TimeDisplay({ deck }: { deck: DeckId }) {
  const elapsedRef = useRef<HTMLSpanElement | null>(null);
  const remainingRef = useRef<HTMLSpanElement | null>(null);
  const bpmRef = useRef<HTMLSpanElement | null>(null);
  const track = useStore(decksStore, (s) => s.decks[deck].track);
  const { engine } = useEngine();

  useDeckFrame(deck, (snapshot) => {
    const sampleRate = engine?.sampleRate ?? 48000;
    const elapsed = snapshot.playheadFrames / sampleRate;
    const total = snapshot.trackFrames / sampleRate;
    if (elapsedRef.current) elapsedRef.current.textContent = formatTime(elapsed);
    if (remainingRef.current) {
      remainingRef.current.textContent = `-${formatTime(Math.max(total - elapsed, 0))}`;
    }
    if (bpmRef.current) {
      bpmRef.current.textContent = snapshot.effectiveBpm > 0 ? snapshot.effectiveBpm.toFixed(1) : "--.-";
    }
  });

  return (
    <div className="rounded-md border border-deck-border bg-panel-sunken px-3 py-2 font-mono">
      <div className="flex items-baseline justify-between">
        <span ref={elapsedRef} className="lcd text-2xl">
          0:00
        </span>
        <span ref={remainingRef} className="lcd-dim text-sm">
          -0:00
        </span>
      </div>
      <div className="mt-1 flex items-center justify-between gap-2 text-[11px]">
        <span className="lcd max-w-[7rem] truncate">{track ? track.title : "No Track"}</span>
        <span className="lcd shrink-0">{track?.key ?? "--"}</span>
        <span className="lcd shrink-0">
          <span ref={bpmRef}>--.-</span> BPM
        </span>
      </div>
    </div>
  );
}
