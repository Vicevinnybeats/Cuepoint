"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useDeckFrame } from "@/hooks/useDeckFrame";
import type { DeckId } from "@cuepoint/engine";

export interface WaveformMarker {
  /** 0..1 along the track. */
  position: number;
  color: string;
  label: string;
}

function formatTime(totalSeconds: number): string {
  const clamped = Number.isFinite(totalSeconds) && totalSeconds > 0 ? totalSeconds : 0;
  const minutes = Math.floor(clamped / 60);
  const seconds = Math.floor(clamped % 60);
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

export function Waveform({
  deck,
  peaks,
  markers = [],
  onSeek,
  height = 48,
  durationSeconds = 0,
}: {
  deck: DeckId;
  peaks: Float32Array | null;
  markers?: WaveformMarker[];
  /** Called with a 0..1 position when the waveform is tapped. */
  onSeek?: (position: number) => void;
  height?: number;
  /** Powers the hover-preview time label; omit to just hide the label. */
  durationSeconds?: number;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const playheadRef = useRef<HTMLDivElement | null>(null);
  const playedMaskRef = useRef<HTMLDivElement | null>(null);
  const [hover, setHover] = useState<number | null>(null);

  // Waveform bars are drawn once per track load (or resize) — they don't
  // change per frame, unlike the playhead below. The canvas's *backing*
  // resolution is tied to the container's real on-screen pixel size (times
  // devicePixelRatio) rather than a fixed guess, so bars stay crisp at any
  // deck-panel width instead of a small bitmap being stretched blurry.
  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !container || !ctx) return;

    const draw = () => {
      const dpr = window.devicePixelRatio || 1;
      const cssWidth = container.clientWidth || 1;
      const cssHeight = container.clientHeight || 1;
      canvas.width = Math.round(cssWidth * dpr);
      canvas.height = Math.round(cssHeight * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, cssWidth, cssHeight);
      if (!peaks || peaks.length === 0) return;

      const mid = cssHeight / 2;
      ctx.strokeStyle = "rgba(255, 255, 255, 0.06)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, mid);
      ctx.lineTo(cssWidth, mid);
      ctx.stroke();

      const gradient = ctx.createLinearGradient(0, 0, 0, cssHeight);
      gradient.addColorStop(0, "#ffd479");
      gradient.addColorStop(0.5, "#ffb020");
      gradient.addColorStop(1, "#ff8a00");
      ctx.fillStyle = gradient;
      ctx.shadowColor = "rgba(255, 176, 32, 0.55)";
      ctx.shadowBlur = 4;

      const barWidth = cssWidth / peaks.length;
      for (let i = 0; i < peaks.length; i++) {
        const amplitude = (peaks[i] as number) * mid;
        ctx.fillRect(i * barWidth, mid - amplitude, Math.max(barWidth - 0.5, 0.6), amplitude * 2);
      }
      ctx.shadowBlur = 0;
    };

    draw();
    const ro = new ResizeObserver(draw);
    ro.observe(container);
    return () => ro.disconnect();
  }, [peaks]);

  useDeckFrame(deck, (snapshot) => {
    const percent =
      snapshot.trackFrames > 0 ? (snapshot.playheadFrames / snapshot.trackFrames) * 100 : 0;
    const clamped = Math.min(Math.max(percent, 0), 100);
    const head = playheadRef.current;
    if (head) head.style.left = `${clamped}%`;
    const mask = playedMaskRef.current;
    if (mask) mask.style.width = `${clamped}%`;
  });

  const positionFromClientX = useCallback((el: HTMLElement, clientX: number) => {
    const rect = el.getBoundingClientRect();
    return Math.min(Math.max((clientX - rect.left) / rect.width, 0), 1);
  }, []);

  const seekFromClientX = useCallback(
    (el: HTMLElement, clientX: number) => {
      if (!onSeek || !peaks) return;
      onSeek(positionFromClientX(el, clientX));
    },
    [onSeek, peaks, positionFromClientX],
  );

  return (
    <div
      ref={containerRef}
      className={`group relative w-full touch-none overflow-hidden rounded-md border border-deck-border bg-panel-sunken ${
        onSeek && peaks ? "cursor-ew-resize" : ""
      }`}
      style={{ height }}
      onPointerDown={(e) => {
        if (!onSeek || !peaks) return;
        e.currentTarget.setPointerCapture(e.pointerId);
        seekFromClientX(e.currentTarget, e.clientX);
      }}
      onPointerMove={(e) => {
        if (peaks) setHover(positionFromClientX(e.currentTarget, e.clientX));
        // A held (captured) pointer keeps reporting moves even off the
        // element — that's what makes this a slide, not just a tap.
        if (e.buttons === 0) return;
        seekFromClientX(e.currentTarget, e.clientX);
      }}
      onPointerLeave={() => setHover(null)}
    >
      <canvas ref={canvasRef} className="h-full w-full" />
      {!peaks && (
        <div className="absolute inset-0 flex items-center justify-center text-[10px] uppercase tracking-wide text-neutral-600">
          No Waveform
        </div>
      )}
      {/* Dims the already-played portion so progress reads at a glance —
          the upcoming part of the track stays at full brightness. */}
      <div
        ref={playedMaskRef}
        className="pointer-events-none absolute inset-y-0 left-0 bg-black/50 mix-blend-multiply"
        style={{ width: "0%" }}
      />
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
      {/* Hover preview — where a click/tap would land, shown before you
          commit to it, with the time it'd jump to. */}
      {hover !== null && peaks && (
        <>
          <div
            className="pointer-events-none absolute top-0 h-full w-px bg-white/50"
            style={{ left: `${hover * 100}%` }}
          />
          {durationSeconds > 0 && (
            <span
              className="lcd pointer-events-none absolute top-0.5 -translate-x-1/2 whitespace-nowrap rounded-sm bg-black/70 px-1 text-[9px] leading-tight"
              style={{ left: `${Math.min(Math.max(hover * 100, 6), 94)}%` }}
            >
              {formatTime(hover * durationSeconds)}
            </span>
          )}
        </>
      )}
      <div
        ref={playheadRef}
        className="pointer-events-none absolute top-0 h-full w-px bg-white shadow-[0_0_4px_rgba(255,255,255,0.8)]"
        style={{ left: "0%" }}
      />
    </div>
  );
}
