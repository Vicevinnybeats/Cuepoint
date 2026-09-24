import Dexie, { type EntityTable } from "dexie";

/**
 * Local track library. Audio never leaves the device — it's stored as a
 * Blob in IndexedDB alongside the metadata the deck needs to reload it
 * without re-decoding through a file picker.
 */
export interface StoredHotCue {
  index: number;
  frame: number;
  color: string;
}

export interface StoredTrack {
  id: string;
  title: string;
  artist: string;
  bpm: number;
  key: string;
  durationSeconds: number;
  waveform: Float32Array;
  audio: Blob;
  cues: StoredHotCue[];
  /** Main CUE point in frames. Optional: tracks saved before it existed
   * don't have one, and read as 0 (track start). */
  mainCue?: number;
  addedAt: number;
  /** Bumped on every change; the sync worker uses this for last-write-wins. */
  updatedAt: number;
}

export interface Playlist {
  id: string;
  name: string;
  /** Track ids in play order. May reference tracks this device doesn't have
   * (synced from another device); those are simply not shown. */
  trackIds: string[];
  createdAt: number;
  updatedAt: number;
  /** Tombstone rather than a hard delete, so a deletion syncs to other
   * devices instead of the playlist reappearing on the next pull. */
  deleted: boolean;
}

export class LibraryDB extends Dexie {
  tracks!: EntityTable<StoredTrack, "id">;
  playlists!: EntityTable<Playlist, "id">;

  constructor(name = "cuepoint-library") {
    super(name);
    this.version(1).stores({
      tracks: "id, title, artist, addedAt",
    });
    this.version(2).stores({
      tracks: "id, title, artist, addedAt",
      playlists: "id, name, updatedAt",
    });
  }
}

/** Shared instance for app code. Tests construct their own named instance. */
export const db = new LibraryDB();
