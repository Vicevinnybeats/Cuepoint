"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { usePhonePortrait } from "@/hooks/usePhonePortrait";

/**
 * Shrinks its content by a uniform scale, just enough to fit the viewport
 * height remaining below it — used to keep the deck+mixer grid to one
 * screen with no scroll, on any desktop window height (a fixed breakpoint
 * can't hand-tune for both a 720p laptop and a 1440p monitor) and as a
 * safety margin against real-device quirks a fixed size can't see coming
 * (e.g. an in-app browser's own chrome eating into the reported viewport
 * height beyond what the compact phone-landscape sizing assumed).
 *
 * `transform: scale()` doesn't participate in layout, so the wrapped
 * content's own `scrollHeight` stays readable as its natural, unscaled
 * height even while the transform is applied — no separate "reset and
 * remeasure" pass needed. The width compensation (`100/scale%`) keeps the
 * visual width at 100% of the container after the shrink; the grid's own
 * height is driven by fixed-size controls (jog wheels, knobs), not by
 * width, so widening it for that compensation doesn't meaningfully change
 * the height being measured.
 *
 * Disabled on a portrait phone, where RotatePrompt already takes over and
 * natural scrolling (not a shrink) is the right behaviour once rotated.
 */
export function FitToViewport({ children }: { children: React.ReactNode }) {
  const portrait = usePhonePortrait();
  const outerRef = useRef<HTMLDivElement | null>(null);
  const innerRef = useRef<HTMLDivElement | null>(null);
  const [scale, setScale] = useState(1);
  const [outerHeight, setOuterHeight] = useState<number | undefined>(undefined);

  useLayoutEffect(() => {
    if (portrait) {
      setScale(1);
      setOuterHeight(undefined);
      return;
    }

    let frame = 0;
    const recompute = () => {
      const inner = innerRef.current;
      const outer = outerRef.current;
      if (!inner || !outer) return;
      const naturalHeight = inner.scrollHeight;
      const top = outer.getBoundingClientRect().top;
      // A little slack for the page's own bottom padding/safe-area inset,
      // which sits below this element and isn't otherwise accounted for.
      const available = window.innerHeight - top - 16;
      const next = naturalHeight > 0 && available > 0 ? Math.min(1, available / naturalHeight) : 1;
      setScale((prev) => (Math.abs(prev - next) > 0.005 ? next : prev));
      setOuterHeight(naturalHeight * next);
    };
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(recompute);
    };

    schedule();
    const ro = new ResizeObserver(schedule);
    if (innerRef.current) ro.observe(innerRef.current);
    window.addEventListener("resize", schedule);
    return () => {
      cancelAnimationFrame(frame);
      ro.disconnect();
      window.removeEventListener("resize", schedule);
    };
  }, [portrait]);

  if (portrait) return <>{children}</>;

  return (
    <div ref={outerRef} style={{ height: outerHeight }}>
      <div
        ref={innerRef}
        style={
          scale < 1
            ? { transform: `scale(${scale})`, transformOrigin: "top left", width: `${100 / scale}%` }
            : undefined
        }
      >
        {children}
      </div>
    </div>
  );
}
