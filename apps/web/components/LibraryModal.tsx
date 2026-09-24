"use client";

import { useEffect, useState } from "react";
import { LibraryPanel } from "./LibraryPanel";
import { SyncPanel } from "./SyncPanel";

/**
 * Desktop-only trigger + modal for the library/sync panels. They used to sit
 * inline below the deck/mixer grid, but that pushed the page past one
 * screen's height — exactly what the compact landscape-phone layout already
 * avoids. Loading a track doesn't need this panel at all (every deck has
 * its own Load Track file picker); this is for browsing what's already in
 * the library, renaming playlists, and setting up sync, so it's fine behind
 * a click instead of permanently on screen.
 */
export function LibraryModal() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="hidden rounded-md border border-deck-border bg-panel-raised px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-neutral-300 lg:inline-flex lg:items-center"
      >
        Tracklist
      </button>
      {open && (
        <div
          className="fixed inset-0 z-30 flex items-center justify-center bg-black/70 p-6"
          onClick={() => setOpen(false)}
        >
          <div
            className="grid max-h-[85vh] w-full max-w-4xl gap-3 overflow-y-auto rounded-xl border border-deck-border bg-panel p-4 shadow-panel lg:grid-cols-2"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="col-span-full flex items-center justify-between">
              <span className="text-sm font-bold tracking-widest text-neutral-300">TRACKLIST</span>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-md border border-deck-border bg-panel-raised px-2.5 py-1 text-xs font-bold text-neutral-300"
                aria-label="Close tracklist"
              >
                Close
              </button>
            </div>
            <LibraryPanel />
            <SyncPanel />
          </div>
        </div>
      )}
    </>
  );
}
