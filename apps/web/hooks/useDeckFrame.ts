"use client";

import { useEffect, useRef } from "react";
import { useEngine } from "@/lib/engine-provider";
import type { DeckSnapshot } from "@cuepoint/dsp";
import type { DeckId } from "@cuepoint/engine";

/**
 * Subscribes to per-quantum audio-thread snapshots without causing a React
 * re-render. `apply` should write directly into refs/DOM style — the
 * architecture rule is that playhead and meters never round-trip through
 * React state at audio rate.
 */
export function useDeckFrame(
  target: DeckId | "master",
  apply: (snapshot: DeckSnapshot) => void,
): void {
  const applyRef = useRef(apply);
  applyRef.current = apply;
  const { onFrame } = useEngine();

  useEffect(() => onFrame(target, (snapshot) => applyRef.current(snapshot)), [target, onFrame]);
}
