"use client";

import { useCallback, useState } from "react";
import { useStore } from "zustand/react";
import {
  db,
  listPlaylists,
  createPlaylist,
  renamePlaylist,
  deletePlaylist,
  addToPlaylist,
  removeFromPlaylist,
  moveInPlaylist,
  deleteTrack,
} from "@cuepoint/library";
import type { StoredTrack, Playlist } from "@cuepoint/library";
import { decksStore, DECK_IDS } from "@cuepoint/engine";
import type { DeckId } from "@cuepoint/engine";
import { useEngine } from "@/lib/engine-provider";
import { useLiveQuery } from "@/hooks/useLiveQuery";

const ALL = "__all__";
const BUTTON =
  "min-h-9 min-w-9 rounded-sm border border-deck-border px-2.5 py-1.5 font-bold text-neutral-300 disabled:opacity-30";

export function LibraryPanel() {
  const tracks = useLiveQuery<StoredTrack[]>(
    () => db.tracks.orderBy("addedAt").reverse().toArray(),
    [],
    [],
  );
  const playlists = useLiveQuery<Playlist[]>(() => listPlaylists(db), [], []);
  const [view, setView] = useState<string>(ALL);
  const [draftName, setDraftName] = useState("");
  const [naming, setNaming] = useState<"create" | "rename" | null>(null);

  const { engine, connect } = useEngine();
  const loadTrack = useStore(decksStore, (s) => s.loadTrack);

  // A playlist deleted on another device (and pulled via sync) falls back
  // to the full library rather than showing an empty ghost view.
  const activePlaylist = playlists.find((p) => p.id === view) ?? null;
  const byId = new Map(tracks.map((t) => [t.id, t]));
  const visible: StoredTrack[] = activePlaylist
    ? activePlaylist.trackIds.flatMap((id) => {
        const t = byId.get(id);
        return t ? [t] : [];
      })
    : tracks;

  const handleLoad = useCallback(
    async (deck: DeckId, track: StoredTrack) => {
      const client = engine ?? (await connect());
      const buffer = await track.audio.arrayBuffer();
      const decoded = await client.decode(buffer);
      client.loadDecodedTrack(deck, decoded, track.bpm);
      loadTrack(
        deck,
        {
          id: track.id,
          title: track.title,
          artist: track.artist,
          bpm: track.bpm,
          key: track.key,
          durationSeconds: track.durationSeconds,
          waveform: track.waveform,
        },
        track.cues,
        track.mainCue ?? 0,
      );
    },
    [connect, engine, loadTrack],
  );

  const submitName = async () => {
    const name = draftName.trim();
    if (!name) return;
    if (naming === "create") {
      const created = await createPlaylist(db, name);
      setView(created.id);
    } else if (naming === "rename" && activePlaylist) {
      await renamePlaylist(db, activePlaylist.id, name);
    }
    setNaming(null);
    setDraftName("");
  };

  return (
    <div className="panel-surface flex flex-col gap-2 rounded-xl border border-deck-border p-3 text-[11px]">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-bold tracking-widest text-neutral-400">LIBRARY</span>
        <select
          className="min-h-9 min-w-0 flex-1 rounded-sm border border-deck-border bg-panel-sunken px-2 text-neutral-200"
          value={activePlaylist ? activePlaylist.id : ALL}
          onChange={(e) => setView(e.target.value)}
          aria-label="Show"
        >
          <option value={ALL}>All tracks ({tracks.length})</option>
          {playlists.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} ({p.trackIds.filter((id) => byId.has(id)).length})
            </option>
          ))}
        </select>
      </div>

      {naming ? (
        <form
          className="flex gap-1"
          onSubmit={(e) => {
            e.preventDefault();
            void submitName();
          }}
        >
          <input
            autoFocus
            className="min-h-9 min-w-0 flex-1 rounded-sm border border-deck-border bg-panel-sunken px-2 text-neutral-200"
            placeholder="Playlist name"
            value={draftName}
            onChange={(e) => setDraftName(e.target.value)}
          />
          <button type="submit" className={BUTTON}>
            Save
          </button>
          <button type="button" className={BUTTON} onClick={() => setNaming(null)}>
            Cancel
          </button>
        </form>
      ) : (
        <div className="flex flex-wrap gap-1">
          <button
            type="button"
            className={BUTTON}
            onClick={() => {
              setDraftName("");
              setNaming("create");
            }}
          >
            + Playlist
          </button>
          {activePlaylist && (
            <>
              <button
                type="button"
                className={BUTTON}
                onClick={() => {
                  setDraftName(activePlaylist.name);
                  setNaming("rename");
                }}
              >
                Rename
              </button>
              <button
                type="button"
                className={`${BUTTON} text-red-400`}
                onClick={() => {
                  void deletePlaylist(db, activePlaylist.id);
                  setView(ALL);
                }}
              >
                Delete playlist
              </button>
            </>
          )}
        </div>
      )}

      {visible.length === 0 ? (
        <p className="py-2 text-center text-neutral-600">
          {activePlaylist
            ? "Empty playlist — add tracks from All tracks with the ＋ menu."
            : "Library is empty — load a track on a deck to save it here."}
        </p>
      ) : (
        <div className="flex max-h-56 flex-col gap-1 overflow-y-auto">
          {visible.map((track, index) => (
            <div
              key={track.id}
              className="flex items-center justify-between gap-2 rounded-md bg-panel-sunken px-2 py-1"
            >
              <div className="min-w-0 flex-1 truncate">
                <span className="text-neutral-200">{track.title}</span>
                <span className="lcd-dim ml-2">{track.bpm.toFixed(1)}</span>
                <span className="lcd-dim ml-2">{track.key}</span>
              </div>
              <div className="flex shrink-0 gap-1">
                {DECK_IDS.map((deck) => (
                  <button
                    key={deck}
                    type="button"
                    className={BUTTON}
                    onClick={() => void handleLoad(deck, track)}
                  >
                    {deck}
                  </button>
                ))}

                {activePlaylist ? (
                  <>
                    <button
                      type="button"
                      className={BUTTON}
                      disabled={index === 0}
                      onClick={() => void moveInPlaylist(db, activePlaylist.id, track.id, -1)}
                      aria-label={`Move ${track.title} up`}
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      className={BUTTON}
                      disabled={index === visible.length - 1}
                      onClick={() => void moveInPlaylist(db, activePlaylist.id, track.id, 1)}
                      aria-label={`Move ${track.title} down`}
                    >
                      ↓
                    </button>
                    <button
                      type="button"
                      className={`${BUTTON} text-red-400`}
                      onClick={() => void removeFromPlaylist(db, activePlaylist.id, track.id)}
                      aria-label={`Remove ${track.title} from ${activePlaylist.name}`}
                    >
                      −
                    </button>
                  </>
                ) : (
                  <>
                    {playlists.length > 0 && (
                      <select
                        className="min-h-9 w-9 rounded-sm border border-deck-border bg-panel-sunken text-center text-neutral-300"
                        value=""
                        onChange={(e) => {
                          if (e.target.value) void addToPlaylist(db, e.target.value, track.id);
                        }}
                        aria-label={`Add ${track.title} to a playlist`}
                      >
                        <option value="">＋</option>
                        {playlists.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                          </option>
                        ))}
                      </select>
                    )}
                    <button
                      type="button"
                      className={`${BUTTON} text-red-400`}
                      onClick={() => void deleteTrack(db, track.id)}
                      aria-label={`Remove ${track.title} from the library`}
                    >
                      ×
                    </button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
