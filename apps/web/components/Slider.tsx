"use client";

import { useCallback, useRef } from "react";

interface SliderProps {
  /** 0..1 for a unipolar fader (channel level), or -1..1 when `bipolar`. */
  value: number;
  onChange: (value: number) => void;
  bipolar?: boolean;
  height?: number;
  label?: string;
}

export function Slider({ value, onChange, bipolar = false, height = 160, label }: SliderProps) {
  const trackRef = useRef<HTMLDivElement | null>(null);

  const setFromClientY = useCallback(
    (clientY: number) => {
      const el = trackRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const t = 1 - Math.min(Math.max((clientY - rect.top) / rect.height, 0), 1);
      onChange(bipolar ? t * 2 - 1 : t);
    },
    [bipolar, onChange],
  );

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      e.currentTarget.setPointerCapture(e.pointerId);
      setFromClientY(e.clientY);
    },
    [setFromClientY],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (e.buttons === 0) return;
      setFromClientY(e.clientY);
    },
    [setFromClientY],
  );

  const t = bipolar ? (value + 1) / 2 : value;
  const thumbTopPercent = (1 - t) * 100;

  return (
    <div className="flex flex-col items-center gap-1">
      <div
        ref={trackRef}
        className="control-surface relative w-9 cursor-ns-resize rounded-md border border-deck-border bg-panel-sunken"
        style={{ height }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        role="slider"
        aria-label={label}
        aria-valuemin={bipolar ? -1 : 0}
        aria-valuemax={1}
        aria-valuenow={value}
        tabIndex={0}
      >
        {bipolar && (
          <div className="pointer-events-none absolute left-0 right-0 top-1/2 h-px bg-deck-border" />
        )}
        <div
          className="pointer-events-none absolute left-1/2 h-4 w-12 -translate-x-1/2 rounded-sm border border-black/40 bg-neutral-300 shadow-md"
          style={{ top: `calc(${thumbTopPercent}% - 8px)` }}
        />
      </div>
      {label && (
        <span className="text-[9px] font-medium uppercase tracking-wide text-neutral-500">
          {label}
        </span>
      )}
    </div>
  );
}
