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

const MIN_ZOOM = 1;
const MAX_ZOOM = 20;

function clamp(v: number, min: number, max: number): number {
  return Math.min(Math.max(v, min), max);
}

function formatTime(totalSeconds: number): string {
  const clamped = Number.isFinite(totalSeconds) && totalSeconds > 0 ? totalSeconds : 0;
  const minutes = Math.floor(clamped / 60);
  const seconds = Math.floor(clamped % 60);
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

/** The visible slice of the track, as a 0..1 fraction range — full track at
 * zoom 1, narrowing and re-centring on `center` (the playhead) as zoom
 * increases, clamped so it never runs past either end of the track. */
function computeWindow(zoom: number, center: number): { start: number; width: number } {
  if (zoom <= 1) return { start: 0, width: 1 };
  const width = 1 / zoom;
  const start = clamp(center - width / 2, 0, 1 - width);
  return { start, width };
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
  const markerRefs = useRef<Array<HTMLDivElement | null>>([]);
  const [hover, setHover] = useState<number | null>(null);
  const [zoom, setZoom] = useState(1);

  // What's actually on screen right now — kept in refs (not state) since
  // both the per-frame playhead tick and the plain pointer handlers below
  // need to read the *current* window without waiting for a React render.
  const windowRef = useRef({ start: 0, width: 1 });
  const lastPlayheadFractionRef = useRef(0);

  // Pinch-to-zoom: tracks up to two active touch points and the zoom level
  // at the moment the second one landed, so the live scale factor between
  // them maps onto a zoom multiplier rather than an absolute value.
  const activePointers = useRef<Map<number, { x: number; y: number }>>(new Map());
  const pinchRef = useRef<{ initialDist: number; initialZoom: number } | null>(null);

  // A freshly loaded track shouldn't inherit the previous one's zoom.
  useEffect(() => {
    setZoom(1);
  }, [peaks]);

  const redraw = useCallback(
    (center: number) => {
      const canvas = canvasRef.current;
      const container = containerRef.current;
      const ctx = canvas?.getContext("2d");
      if (!canvas || !container || !ctx) return;

      const dpr = window.devicePixelRatio || 1;
      const cssWidth = container.clientWidth || 1;
      const cssHeight = container.clientHeight || 1;
      canvas.width = Math.round(cssWidth * dpr);
      canvas.height = Math.round(cssHeight * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, cssWidth, cssHeight);

      if (!peaks || peaks.length === 0) {
        windowRef.current = { start: 0, width: 1 };
        return;
      }

      const win = computeWindow(zoom, center);
      windowRef.current = win;

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

      const startIndex = win.start * peaks.length;
      const visibleCount = Math.max(win.width * peaks.length, 1);
      const barWidth = cssWidth / visibleCount;
      const firstIdx = Math.max(Math.floor(startIndex), 0);
      const lastIdx = Math.min(Math.ceil(startIndex + visibleCount), peaks.length);
      for (let i = firstIdx; i < lastIdx; i++) {
        const amplitude = (peaks[i] as number) * mid;
        const x = (i - startIndex) * barWidth;
        ctx.fillRect(x, mid - amplitude, Math.max(barWidth - 0.5, 0.6), amplitude * 2);
      }
      ctx.shadowBlur = 0;
    },
    [peaks, zoom],
  );

  /** Moves the playhead/progress-mask/cue-marker overlays to match the
   * current window, without a React re-render — called every frame while
   * zoomed (the window scrolls with playback), or once after a resize/zoom
   * change while paused. */
  const updateOverlay = useCallback((playheadFraction: number) => {
    const win = windowRef.current;
    const local = win.width > 0 ? clamp((playheadFraction - win.start) / win.width, 0, 1) : 0;
    const percent = local * 100;
    if (playheadRef.current) playheadRef.current.style.left = `${percent}%`;
    if (playedMaskRef.current) playedMaskRef.current.style.width = `${percent}%`;

    for (let i = 0; i < markers.length; i++) {
      const el = markerRefs.current[i];
      if (!el) continue;
      const m = markers[i];
      if (!m) continue;
      const localPos = win.width > 0 ? (m.position - win.start) / win.width : -1;
      if (localPos < -0.02 || localPos > 1.02) {
        el.style.display = "none";
      } else {
        el.style.display = "";
        el.style.left = `${clamp(localPos, 0, 1) * 100}%`;
      }
    }
  }, [markers]);

  // Redraw whenever the container resizes, and whenever zoom changes (so
  // scrolling/pinching to zoom updates immediately even while paused).
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const tick = () => {
      redraw(lastPlayheadFractionRef.current);
      updateOverlay(lastPlayheadFractionRef.current);
    };
    tick();
    const ro = new ResizeObserver(tick);
    ro.observe(container);
    return () => ro.disconnect();
  }, [redraw, updateOverlay]);

  useDeckFrame(deck, (snapshot) => {
    const fraction = snapshot.trackFrames > 0 ? snapshot.playheadFrames / snapshot.trackFrames : 0;
    const clamped = clamp(fraction, 0, 1);
    lastPlayheadFractionRef.current = clamped;
    // A static (zoom 1) waveform never needs a per-frame canvas redraw —
    // only the overlay positions move. Zoomed in, the visible window itself
    // scrolls with playback, so the bars have to redraw too.
    if (zoom > 1) redraw(clamped);
    updateOverlay(clamped);
  });

  const positionFromClientX = useCallback((el: HTMLElement, clientX: number) => {
    return clamp((clientX - el.getBoundingClientRect().left) / el.getBoundingClientRect().width, 0, 1);
  }, []);

  /** Local (0..1 within the visible window) to global (0..1 along the whole
   * track) — what onSeek and the hover time label need. */
  const toGlobal = useCallback((local: number) => {
    const win = windowRef.current;
    return clamp(win.start + local * win.width, 0, 1);
  }, []);

  const seekFromClientX = useCallback(
    (el: HTMLElement, clientX: number) => {
      if (!onSeek || !peaks) return;
      onSeek(toGlobal(positionFromClientX(el, clientX)));
    },
    [onSeek, peaks, positionFromClientX, toGlobal],
  );

  const endPointer = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    activePointers.current.delete(e.pointerId);
    if (activePointers.current.size < 2) pinchRef.current = null;
  }, []);

  const hoverGlobal = hover !== null ? toGlobal(hover) : null;

  // A native (non-passive) listener, not React's onWheel — React attaches
  // wheel handlers as passive by default, which silently no-ops (and logs a
  // warning on) preventDefault, so the page would scroll while scroll-zooming.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const handler = (e: WheelEvent) => {
      if (!peaks) return;
      e.preventDefault();
      const factor = Math.pow(1.0025, -e.deltaY);
      setZoom((z) => clamp(z * factor, MIN_ZOOM, MAX_ZOOM));
    };
    el.addEventListener("wheel", handler, { passive: false });
    return () => el.removeEventListener("wheel", handler);
  }, [peaks]);

  return (
    <div
      ref={containerRef}
      className={`group relative w-full touch-none select-none overflow-hidden rounded-md border border-deck-border bg-panel-sunken ${
        onSeek && peaks ? "cursor-ew-resize" : ""
      }`}
      style={{ height }}
      onDoubleClick={() => setZoom(1)}
      onPointerDown={(e) => {
        activePointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (activePointers.current.size === 2) {
          // A second finger landed — this is a pinch, not a seek-drag.
          // Release any capture the first finger grabbed so both pointers'
          // moves report freely.
          for (const id of activePointers.current.keys()) {
            try {
              e.currentTarget.releasePointerCapture(id);
            } catch {
              // Wasn't captured — fine.
            }
          }
          const [a, b] = Array.from(activePointers.current.values());
          pinchRef.current = {
            initialDist: a && b ? Math.hypot(a.x - b.x, a.y - b.y) || 1 : 1,
            initialZoom: zoom,
          };
          return;
        }
        if (activePointers.current.size > 2 || !onSeek || !peaks) return;
        e.currentTarget.setPointerCapture(e.pointerId);
        seekFromClientX(e.currentTarget, e.clientX);
      }}
      onPointerMove={(e) => {
        if (activePointers.current.has(e.pointerId)) {
          activePointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
        }
        if (pinchRef.current && activePointers.current.size === 2) {
          const [a, b] = Array.from(activePointers.current.values());
          const dist = a && b ? Math.hypot(a.x - b.x, a.y - b.y) || 1 : 1;
          const scale = dist / pinchRef.current.initialDist;
          setZoom(clamp(pinchRef.current.initialZoom * scale, MIN_ZOOM, MAX_ZOOM));
          return;
        }
        if (peaks) setHover(positionFromClientX(e.currentTarget, e.clientX));
        // A held (captured) pointer keeps reporting moves even off the
        // element — that's what makes this a slide, not just a tap.
        if (e.buttons === 0) return;
        seekFromClientX(e.currentTarget, e.clientX);
      }}
      onPointerUp={endPointer}
      onPointerCancel={endPointer}
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
      {markers.map((marker, i) => (
        <div
          key={marker.label}
          ref={(el) => {
            markerRefs.current[i] = el;
          }}
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
      {hover !== null && hoverGlobal !== null && peaks && (
        <>
          <div
            className="pointer-events-none absolute top-0 h-full w-px bg-white/50"
            style={{ left: `${hover * 100}%` }}
          />
          {durationSeconds > 0 && (
            <span
              className="lcd pointer-events-none absolute top-0.5 -translate-x-1/2 whitespace-nowrap rounded-sm bg-black/70 px-1 text-[9px] leading-tight"
              style={{ left: `${clamp(hover * 100, 6, 94)}%` }}
            >
              {formatTime(hoverGlobal * durationSeconds)}
            </span>
          )}
        </>
      )}
      <div
        ref={playheadRef}
        className="pointer-events-none absolute top-0 h-full w-px bg-white shadow-[0_0_4px_rgba(255,255,255,0.8)]"
        style={{ left: "0%" }}
      />
      {/* Scroll/pinch to zoom in for finer cue placement; tap this (or
          double-click/tap the waveform) to reset. */}
      {zoom > 1.05 && (
        <button
          type="button"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            setZoom(1);
          }}
          className="lcd pointer-events-auto absolute right-1 top-1 z-10 rounded-sm bg-black/70 px-1.5 py-0.5 text-[9px] font-semibold leading-none"
          title="Reset zoom"
        >
          {zoom.toFixed(1)}×
        </button>
      )}
    </div>
  );
}
