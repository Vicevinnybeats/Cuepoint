import "fake-indexeddb/auto";
import { describe, it, expect, beforeEach } from "vitest";
import { LibraryDB } from "../src/db.js";
import type { StoredTrack } from "../src/db.js";

function makeTrack(overrides: Partial<StoredTrack> = {}): StoredTrack {
  return {
    id: "1",
    title: "Song",
    artist: "Artist",
    bpm: 128,
    key: "--",
    durationSeconds: 200,
    waveform: new Float32Array([0.1, 0.5, 0.2]),
    audio: new Blob([new Uint8Array([1, 2, 3])]),
    cues: [],
    addedAt: Date.now(),
    updatedAt: Date.now(),
    ...overrides,
  };
}

describe("LibraryDB", () => {
  let db: LibraryDB;

  beforeEach(() => {
    // Unique name per test so IndexedDB state doesn't leak between them.
    db = new LibraryDB(`test-${Math.random()}`);
  });

  it("stores and retrieves a track, preserving typed-array fidelity", async () => {
    await db.tracks.put(makeTrack());
    const track = await db.tracks.get("1");
    expect(track?.title).toBe("Song");
    expect(track?.waveform).toBeInstanceOf(Float32Array);
    expect(Array.from(track?.waveform ?? [])).toEqual(Array.from(new Float32Array([0.1, 0.5, 0.2])));
  });

  it("lists tracks newest first", async () => {
    await db.tracks.put(makeTrack({ id: "a", addedAt: 1 }));
    await db.tracks.put(makeTrack({ id: "b", addedAt: 2 }));
    const list = await db.tracks.orderBy("addedAt").reverse().toArray();
    expect(list.map((t) => t.id)).toEqual(["b", "a"]);
  });

  it("upserts by id rather than duplicating on reload", async () => {
    await db.tracks.put(makeTrack({ id: "x", bpm: 120 }));
    await db.tracks.put(makeTrack({ id: "x", bpm: 128 }));
    expect(await db.tracks.count()).toBe(1);
    expect((await db.tracks.get("x"))?.bpm).toBe(128);
  });

  it("deletes a track", async () => {
    await db.tracks.put(makeTrack({ id: "gone" }));
    await db.tracks.delete("gone");
    expect(await db.tracks.get("gone")).toBeUndefined();
  });

  it("persists hot cues and lets them be updated in place", async () => {
    await db.tracks.put(makeTrack({ id: "cued", cues: [] }));
    await db.tracks.update("cued", {
      cues: [{ index: 0, frame: 4800, color: "#ff5a3c" }],
      updatedAt: 999,
    });
    const track = await db.tracks.get("cued");
    expect(track?.cues).toEqual([{ index: 0, frame: 4800, color: "#ff5a3c" }]);
    expect(track?.updatedAt).toBe(999);
  });

  it("round-trips the audio blob", async () => {
    const bytes = new Uint8Array([9, 8, 7, 6]);
    await db.tracks.put(makeTrack({ id: "audio", audio: new Blob([bytes]) }));
    const track = await db.tracks.get("audio");
    const roundTripped = new Uint8Array(await track!.audio.arrayBuffer());
    expect(Array.from(roundTripped)).toEqual([9, 8, 7, 6]);
  });
});
