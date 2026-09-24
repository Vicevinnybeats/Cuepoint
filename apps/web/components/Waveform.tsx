"use client";

import { useEffect, useRef } from "react";
import { useDeckFrame } from "@/hooks/useDeckFrame";
import type { DeckId } from "@cuepoint/engine";

export interface WaveformMarker {
  /** 0..1 along the track. */
  position: number;
  color: string;
  label: string;
}

export function Waveform({
  deck,
  peaks,
  markers = [],
  onSeek,
  height = 48,
}: {
  deck: DeckId;
  peaks: Float32Array | null;
  markers?: WaveformMarker[];
  /** Called with a 0..1 position when the waveform is tapped. */
  onSeek?: (position: number) => void;
  height?: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const playheadRef = useRef<HTMLDivElement | null>(null);

  // Waveform bars are drawn once per track load — they don't change per
  // frame, unlike the playhead line below.
  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (!peaks || peaks.length === 0) return;

    const mid = canvas.height / 2;
    const barWidth = canvas.width / peaks.length;
    ctx.fillStyle = "#ffb020";
    for (let i = 0; i < peaks.length; i++) {
      const amplitude = (peaks[i] as number) * mid;
      ctx.fillRect(i * barWidth, mid - amplitude, Math.max(barWidth - 0.5, 0.5), amplitude * 2);
    }
  }, [peaks]);

  useDeckFrame(deck, (snapshot) => {
    const el = playheadRef.current;
    if (!el) return;
    const percent =
      snapshot.trackFrames > 0 ? (snapshot.playheadFrames / snapshot.trackFrames) * 100 : 0;
    el.style.left = `${Math.min(Math.max(percent, 0), 100)}%`;
  });

  return (
    <div
      className={`relative w-full overflow-hidden rounded-md border border-deck-border bg-panel-sunken ${
        onSeek && peaks ? "cursor-pointer" : ""
      }`}
      style={{ height }}
      onPointerDown={(e) => {
        if (!onSeek || !peaks) return;
        const rect = e.currentTarget.getBoundingClientRect();
        onSeek(Math.min(Math.max((e.clientX - rect.left) / rect.width, 0), 1));
      }}
    >
      <canvas ref={canvasRef} width={300} height={height} className="h-full w-full" />
      {!peaks && (
        <div className="absolute inset-0 flex items-center justify-center text-[10px] uppercase tracking-wide text-neutral-600">
          No Waveform
        </div>
      )}
      {markers.map((marker) => (
        <div
          key={marker.label}
          className="pointer-events-none absolute top-0 h-full w-0.5"
          style={{ left: `${marker.position * 100}%`, backgroundColor: marker.color }}
        >
          <span
            className="absolute left-0.5 top-0 rounded-sm px-0.5 text-[8px] font-bold leading-tight text-black"
            style={{ backgroundColor: marker.color }}
          >
            {marker.label}
          </span>
        </div>
      ))}
      <div
        ref={playheadRef}
        className="pointer-events-none absolute top-0 h-full w-px bg-white/80"
        style={{ left: "0%" }}
      />
    </div>
  );
}
