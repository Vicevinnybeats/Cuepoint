"use client";

import { useCallback, useRef } from "react";

interface KnobProps {
  /** 0..1 for a unipolar knob (gain, EQ band), or -1..1 when `bipolar`. */
  value: number;
  onChange: (value: number) => void;
  bipolar?: boolean;
  size?: number;
  label?: string;
  /** Tailwind text-color class; the indicator line uses currentColor. */
  accent?: string;
  /** Value a double-click resets to. Defaults to the knob's own centre
   * (0 bipolar, 0.5 unipolar) — override when the caller's value mapping
   * puts "neutral" (e.g. unity gain) somewhere else on the 0..1/-1..1 range. */
  resetValue?: number;
}

/** Vertical pixels of drag to sweep the knob's full range — a mouse/touch
 * knob has no physical travel, so this stands in for one. */
const DRAG_SENSITIVITY_PX = 220;

export function Knob({
  value,
  onChange,
  bipolar = false,
  size = 44,
  label,
  accent = "text-amber",
  resetValue,
}: KnobProps) {
  const dragStart = useRef<{ y: number; value: number } | null>(null);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      e.currentTarget.setPointerCapture(e.pointerId);
      dragStart.current = { y: e.clientY, value };
    },
    [value],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const start = dragStart.current;
      if (!start) return;
      const range = bipolar ? 2 : 1;
      const min = bipolar ? -1 : 0;
      const delta = ((start.y - e.clientY) / DRAG_SENSITIVITY_PX) * range;
      onChange(Math.min(Math.max(start.value + delta, min), min + range));
    },
    [bipolar, onChange],
  );

  const handlePointerUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    dragStart.current = null;
    e.currentTarget.releasePointerCapture(e.pointerId);
  }, []);

  const handleDoubleClick = useCallback(() => {
    onChange(resetValue ?? (bipolar ? 0 : 0.5));
  }, [bipolar, onChange, resetValue]);

  // Hardware knobs sweep about 270 degrees, centred at 12 o'clock.
  const t = bipolar ? (value + 1) / 2 : value;
  const angle = -135 + t * 270;

  return (
    <div className="flex flex-col items-center gap-1">
      <div
        className={`control-surface knob-surface relative cursor-ns-resize rounded-full shadow-knob ${accent}`}
        style={{ width: size, height: size }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onDoubleClick={handleDoubleClick}
        role="slider"
        aria-label={label}
        aria-valuemin={bipolar ? -1 : 0}
        aria-valuemax={1}
        aria-valuenow={value}
        tabIndex={0}
      >
        <div className="pointer-events-none absolute inset-0 rounded-full border border-deck-border" />
        <div
          className="pointer-events-none absolute left-1/2 top-1/2 h-[42%] w-[2px] origin-bottom rounded-full bg-current"
          style={{ transform: `translate(-50%, -100%) rotate(${angle}deg)` }}
        />
        {bipolar && (
          <div className="pointer-events-none absolute left-1/2 top-1/2 h-[3px] w-[3px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-deck-border" />
        )}
      </div>
      {label && (
        <span className="text-[9px] font-medium uppercase tracking-wide text-neutral-500">
          {label}
        </span>
      )}
    </div>
  );
}
