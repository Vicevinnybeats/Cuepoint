"use client";

import { useEffect, useState } from "react";
import { usePhonePortrait } from "@/hooks/usePhonePortrait";

const SEEN_KEY = "cuepoint-onboarding-v1";

const STEPS: Array<{ title: string; body: string }> = [
  {
    title: "Welcome to Cuepoint",
    body: "A 4-deck DJ mixer, right in your browser — built to feel like Virtual DJ or Traktor Pro. Quick tour, about 30 seconds.",
  },
  {
    title: "Load a track",
    body: "Tap Load Track on any deck to pick a song from your phone or computer. Cuepoint measures its BPM, musical key and waveform automatically — no tagging needed.",
  },
  {
    title: "Play, Cue, Sync",
    body: "Play starts the deck. Hold Cue to preview from your cue point and it snaps back on release. Sync matches this deck's BPM to its partner deck (A with B, C with D).",
  },
  {
    title: "The BPM control",
    body: "Drag a deck's BPM fader to change tempo without touching pitch — the track never sounds “chipmunked.” Double-click the fader to snap back to the track's original BPM.",
  },
  {
    title: "The mixer channel",
    body: "Each of the 4 channels has Gain, a 3-band EQ and a Filter, plus a Level fader. Double-click any knob or fader to snap it back to its neutral position.",
  },
  {
    title: "Crossfader & assign",
    body: "The crossfader blends between its A and B sides. Every channel has its own A / Thru / B switch deciding which side it answers to — double-click a switch to reset it to Thru.",
  },
  {
    title: "Hot cues & loops",
    body: "Tap a numbered pad to drop a hot cue, tap it again to jump back. Long-press (or right-click on desktop) to clear one. The loop row drops an instant beat loop, in beats.",
  },
  {
    title: "Library & sync",
    body: "Open Tracklist to browse saved tracks and playlists, and set up sync — Cuepoint keeps cues, BPM and playlists in step across your own devices. Audio itself never leaves the device that loaded it.",
  },
  {
    title: "You're set",
    body: "On a phone, turn it sideways to see all 4 decks at once. Reopen this tour anytime from the ? button in the corner.",
  },
];

/** First-run walkthrough, reopenable from the header's "?" button. A plain
 * sequential modal rather than pointing at specific controls — the compact
 * phone-landscape layout, portrait, and desktop all place controls too
 * differently for on-screen pointers to stay accurate across all three. */
export function OnboardingTour() {
  const portrait = usePhonePortrait();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);

  useEffect(() => {
    let seen = true;
    try {
      seen = localStorage.getItem(SEEN_KEY) === "1";
    } catch {
      // Private browsing or storage disabled — just don't auto-show it.
    }
    if (seen || portrait) return;
    // Let the intro splash (see intro-splash.tsx, ~1.5s) finish first.
    const timer = setTimeout(() => setOpen(true), 1800);
    return () => clearTimeout(timer);
  }, [portrait]);

  const close = () => {
    setOpen(false);
    setStep(0);
    try {
      localStorage.setItem(SEEN_KEY, "1");
    } catch {
      // Nothing we can do without storage; it'll just show again next time.
    }
  };

  if (portrait) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setStep(0);
          setOpen(true);
        }}
        aria-label="How Cuepoint works"
        title="How Cuepoint works"
        className="fixed bottom-3 right-3 z-20 flex h-7 w-7 items-center justify-center rounded-full border border-deck-border bg-panel-raised text-xs font-bold text-neutral-300 shadow-panel landscape:hidden lg:landscape:flex"
      >
        ?
      </button>

      {open && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/70 p-6" onClick={close}>
          <div
            className="flex w-full max-w-sm flex-col gap-4 rounded-xl border border-deck-border bg-panel p-5 shadow-panel"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold tracking-widest text-neutral-500">
                {step + 1} / {STEPS.length}
              </span>
              <button
                type="button"
                onClick={close}
                className="rounded-md border border-deck-border bg-panel-raised px-2 py-1 text-[10px] font-bold uppercase text-neutral-400"
              >
                Skip
              </button>
            </div>

            <div className="flex flex-col gap-2">
              <h2 className="text-base font-bold tracking-wide text-amber">{STEPS[step]?.title}</h2>
              <p className="text-sm leading-relaxed text-neutral-300">{STEPS[step]?.body}</p>
            </div>

            <div className="flex items-center justify-center gap-1.5">
              {STEPS.map((s, i) => (
                <div
                  key={s.title}
                  className={`h-1.5 w-1.5 rounded-full ${i === step ? "bg-amber" : "bg-deck-border"}`}
                />
              ))}
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={step === 0}
                onClick={() => setStep((s) => Math.max(0, s - 1))}
                className="flex-1 rounded-md border border-deck-border bg-panel-raised py-2 text-xs font-bold uppercase text-neutral-300 disabled:opacity-30"
              >
                Back
              </button>
              <button
                type="button"
                onClick={() => (step === STEPS.length - 1 ? close() : setStep((s) => s + 1))}
                className="flex-[2] rounded-md bg-accent py-2 text-xs font-bold uppercase text-black"
              >
                {step === STEPS.length - 1 ? "Start mixing" : "Next"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
