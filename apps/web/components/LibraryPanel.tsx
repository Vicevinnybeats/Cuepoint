"use client";

import { useCallback } from "react";
import { useStore } from "zustand/react";
import { db } from "@cuepoint/library";
import type { StoredTrack } from "@cuepoint/library";
import { decksStore } from "@cuepoint/engine";
import type { DeckId } from "@cuepoint/engine";
import { useEngine } from "@/lib/engine-provider";
import { useLiveQuery } from "@/hooks/useLiveQuery";

export function LibraryPanel() {
  const tracks = useLiveQuery<StoredTrack[]>(
    () => db.tracks.orderBy("addedAt").reverse().toArray(),
    [],
    [],
  );
  const { engine, connect } = useEngine();
  const loadTrack = useStore(decksStore, (s) => s.loadTrack);

  const handleLoad = useCallback(
    async (deck: DeckId, track: StoredTrack) => {
      const client = engine ?? (await connect());
      const buffer = await track.audio.arrayBuffer();
      const decoded = await client.decode(buffer);
      client.loadDecodedTrack(deck, decoded, track.bpm);
      loadTrack(deck, {
        id: track.id,
        title: track.title,
        artist: track.artist,
        bpm: track.bpm,
        key: track.key,
        durationSeconds: track.durationSeconds,
        waveform: track.waveform,
      });
    },
    [connect, engine, loadTrack],
  );

  if (tracks.length === 0) {
    return (
      <div className="panel-surface rounded-xl border border-deck-border p-3 text-center text-[11px] text-neutral-600">
        Library is empty — load a track on a deck to save it here.
      </div>
    );
  }

  return (
    <div className="panel-surface flex flex-col gap-2 rounded-xl border border-deck-border p-3">
      <span className="text-xs font-bold tracking-widest text-neutral-400">LIBRARY</span>
      <div className="flex max-h-40 flex-col gap-1 overflow-y-auto">
        {tracks.map((track) => (
          <div
            key={track.id}
            className="flex items-center justify-between gap-2 rounded-md bg-panel-sunken px-2 py-1 text-[11px]"
          >
            <div className="min-w-0 flex-1 truncate">
              <span className="text-neutral-200">{track.title}</span>
              <span className="lcd-dim ml-2">{track.bpm.toFixed(1)} BPM</span>
              <span className="lcd-dim ml-2">{track.key}</span>
            </div>
            <div className="flex shrink-0 gap-1">
              <button
                type="button"
                className="rounded-sm border border-deck-border px-2 py-0.5 font-bold text-neutral-300"
                onClick={() => void handleLoad("A", track)}
              >
                A
              </button>
              <button
                type="button"
                className="rounded-sm border border-deck-border px-2 py-0.5 font-bold text-neutral-300"
                onClick={() => void handleLoad("B", track)}
              >
                B
              </button>
              <button
                type="button"
                className="rounded-sm border border-deck-border px-2 py-0.5 text-red-400"
                onClick={() => void db.tracks.delete(track.id)}
                aria-label={`Remove ${track.title} from the library`}
              >
                ×
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
