import Dexie, { type EntityTable } from "dexie";

/**
 * Local track library. Audio never leaves the device — it's stored as a
 * Blob in IndexedDB alongside the metadata the deck needs to reload it
 * without re-decoding through a file picker.
 */
export interface StoredTrack {
  id: string;
  title: string;
  artist: string;
  bpm: number;
  key: string;
  durationSeconds: number;
  waveform: Float32Array;
  audio: Blob;
  addedAt: number;
}

export class LibraryDB extends Dexie {
  tracks!: EntityTable<StoredTrack, "id">;

  constructor(name = "cuepoint-library") {
    super(name);
    this.version(1).stores({
      tracks: "id, title, artist, addedAt",
    });
  }
}

/** Shared instance for app code. Tests construct their own named instance. */
export const db = new LibraryDB();
