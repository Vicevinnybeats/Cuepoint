"use client";

import { useRef } from "react";
import { useDeckFrame } from "@/hooks/useDeckFrame";
import type { DeckId } from "@cuepoint/engine";

export function LevelMeter({ target, height = 160 }: { target: DeckId | "master"; height?: number }) {
  const fillRef = useRef<HTMLDivElement | null>(null);
  const clipRef = useRef<HTMLDivElement | null>(null);

  useDeckFrame(target, (snapshot) => {
    const level = Math.min(Math.max(snapshot.peakLeft, snapshot.peakRight), 1);
    if (fillRef.current) fillRef.current.style.transform = `scaleY(${level})`;
    if (clipRef.current) clipRef.current.style.opacity = snapshot.clipping ? "1" : "0";
  });

  return (
    <div
      className="relative w-3 overflow-hidden rounded-sm border border-deck-border bg-panel-sunken"
      style={{ height }}
    >
      <div
        ref={fillRef}
        className="absolute bottom-0 left-0 right-0 top-0 origin-bottom"
        style={{
          transform: "scaleY(0)",
          backgroundImage:
            "linear-gradient(180deg, #ff4444 0%, #f5c400 22%, #35d07f 55%, #1c8f52 100%)",
        }}
      />
      <div
        ref={clipRef}
        className="absolute left-0 right-0 top-0 h-1.5 bg-red-500 opacity-0"
      />
    </div>
  );
}
