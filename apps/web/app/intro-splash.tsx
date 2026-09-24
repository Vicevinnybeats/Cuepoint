"use client";

import { useEffect, useState } from "react";

const HOLD_MS = 900;
const FADE_MS = 600;

/**
 * App-launch splash: the name, then a fade to the deck UI underneath.
 * Shown on every load (it's a launch splash, not a one-time onboarding
 * screen) — local component state resets on every page load, so no
 * localStorage "seen it" flag is needed.
 */
export function IntroSplash() {
  const [fadingOut, setFadingOut] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduceMotion) {
      setDone(true);
      return;
    }
    const startFade = setTimeout(() => setFadingOut(true), HOLD_MS);
    const finish = setTimeout(() => setDone(true), HOLD_MS + FADE_MS);
    return () => {
      clearTimeout(startFade);
      clearTimeout(finish);
    };
  }, []);

  if (done) return null;

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center bg-[#0a0a0b] transition-opacity duration-[600ms] ${
        fadingOut ? "pointer-events-none opacity-0" : "opacity-100"
      }`}
      aria-hidden="true"
    >
      <span className="intro-name text-2xl font-bold uppercase tracking-[0.5em] text-amber">
        Cuepoint
      </span>
    </div>
  );
}
