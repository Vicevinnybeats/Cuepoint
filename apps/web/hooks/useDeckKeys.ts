"use client";

import { useEffect, useRef } from "react";
import type { DeckId } from "@cuepoint/engine";

export interface DeckKeyHandlers {
  cueDown(): void;
  cueUp(): void;
  play(): void;
  sync(): void;
  hotCue(index: number): void;
}

/** Left hand drives deck A, right hand deck B — the usual laptop-DJ split. */
const KEYMAP: Record<DeckId, { cue: string; play: string; sync: string; hotCues: string[] }> = {
  A: { cue: "q", play: "w", sync: "s", hotCues: ["1", "2", "3", "4"] },
  B: { cue: "o", play: "p", sync: "l", hotCues: ["7", "8", "9", "0"] },
};

export const DECK_KEY_HINTS: Record<DeckId, string> = {
  A: "Keys: Q cue · W play · S sync · 1–4 hot cues",
  B: "Keys: O cue · P play · L sync · 7–0 hot cues",
};

function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ["INPUT", "SELECT", "TEXTAREA"].includes(target.tagName);
}

/** Keyboard control for one deck. Ignores key repeat, modifier chords, and
 * keys typed into form fields (library search, sync key, playlist names). */
export function useDeckKeys(deck: DeckId, handlers: DeckKeyHandlers): void {
  const ref = useRef(handlers);
  ref.current = handlers;

  useEffect(() => {
    const keys = KEYMAP[deck];
    const onDown = (e: KeyboardEvent) => {
      if (e.repeat || e.metaKey || e.ctrlKey || e.altKey || isTyping(e.target)) return;
      const key = e.key.toLowerCase();
      const hot = keys.hotCues.indexOf(key);
      if (key === keys.cue) ref.current.cueDown();
      else if (key === keys.play) ref.current.play();
      else if (key === keys.sync) ref.current.sync();
      else if (hot !== -1) ref.current.hotCue(hot);
      else return;
      e.preventDefault();
    };
    const onUp = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === keys.cue) ref.current.cueUp();
    };
    window.addEventListener("keydown", onDown);
    window.addEventListener("keyup", onUp);
    return () => {
      window.removeEventListener("keydown", onDown);
      window.removeEventListener("keyup", onUp);
    };
  }, [deck]);
}
