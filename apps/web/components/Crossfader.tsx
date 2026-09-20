"use client";

import { useCallback, useRef } from "react";

export function Crossfader({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const trackRef = useRef<HTMLDivElement | null>(null);

  const setFromClientX = useCallback(
    (clientX: number) => {
      const el = trackRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const t = Math.min(Math.max((clientX - rect.left) / rect.width, 0), 1);
      onChange(t * 2 - 1);
    },
    [onChange],
  );

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      e.currentTarget.setPointerCapture(e.pointerId);
      setFromClientX(e.clientX);
    },
    [setFromClientX],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (e.buttons === 0) return;
      setFromClientX(e.clientX);
    },
    [setFromClientX],
  );

  const thumbLeftPercent = ((value + 1) / 2) * 100;

  return (
    <div className="flex w-full flex-col items-center gap-1">
      <div className="flex w-full justify-between px-1 text-[9px] font-bold text-neutral-500">
        <span>A</span>
        <span>B</span>
      </div>
      <div
        ref={trackRef}
        className="control-surface relative h-7 w-full cursor-ew-resize rounded-md border border-deck-border bg-panel-sunken"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        role="slider"
        aria-label="Crossfader"
        aria-valuemin={-1}
        aria-valuemax={1}
        aria-valuenow={value}
        tabIndex={0}
      >
        <div className="pointer-events-none absolute left-1/2 top-0 h-full w-px bg-deck-border" />
        <div
          className="pointer-events-none absolute top-1/2 h-6 w-10 -translate-y-1/2 rounded-sm border border-black/40 bg-neutral-300 shadow-md"
          style={{ left: `calc(${thumbLeftPercent}% - 20px)` }}
        />
      </div>
    </div>
  );
}
