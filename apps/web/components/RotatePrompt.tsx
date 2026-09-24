"use client";

import { usePhonePortrait } from "@/hooks/usePhonePortrait";

/**
 * Blocks the UI on a phone held in portrait. The 4-deck mixer only fits
 * (see page.tsx's landscape-compact layout) with a phone's width, not its
 * height — in portrait each deck is full desktop size and only one fits on
 * screen at a time, which reads as broken rather than as "scroll for more".
 * Telling people to rotate is more honest than shipping a portrait mode
 * that technically scrolls but isn't actually usable as a 4-deck mixer.
 */
export function RotatePrompt() {
  const portrait = usePhonePortrait();
  if (!portrait) return null;

  return (
    <div className="fixed inset-0 z-40 flex flex-col items-center justify-center gap-4 bg-[#0a0a0b] p-6 text-center">
      <svg
        viewBox="0 0 24 24"
        className="rotate-hint h-16 w-16 text-amber"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        aria-hidden="true"
      >
        <rect x="6" y="3" width="12" height="18" rx="2" />
        <path d="M12 18h.01" strokeWidth={2.5} strokeLinecap="round" />
      </svg>
      <p className="max-w-xs text-sm font-semibold uppercase tracking-wide text-neutral-300">
        Rotate your phone to landscape
      </p>
      <p className="max-w-xs text-xs text-neutral-500">
        Cuepoint's 4-deck mixer needs the width — turn your phone sideways to see everything at
        once.
      </p>
    </div>
  );
}
