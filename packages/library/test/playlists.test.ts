import "fake-indexeddb/auto";
import { describe, it, expect, beforeEach } from "vitest";
import { LibraryDB } from "../src/db.js";
import type { StoredTrack } from "../src/db.js";
import {
  listPlaylists,
  createPlaylist,
  renamePlaylist,
  deletePlaylist,
  addToPlaylist,
  removeFromPlaylist,
  moveInPlaylist,
  deleteTrack,
} from "../src/playlists.js";

function track(id: string): StoredTrack {
  return {
    id,
    title: id,
    artist: "",
    bpm: 128,
    key: "8A",
    durationSeconds: 1,
    waveform: new Float32Array(0),
    audio: new Blob([]),
    cues: [],
    addedAt: 1,
    updatedAt: 1,
  };
}

describe("playlists", () => {
  let db: LibraryDB;
  beforeEach(() => {
    db = new LibraryDB(`test-${Math.random()}`);
  });

  it("creates playlists and lists them alphabetically", async () => {
    await createPlaylist(db, "Warmup");
    await createPlaylist(db, "Afterhours");
    expect((await listPlaylists(db)).map((p) => p.name)).toEqual(["Afterhours", "Warmup"]);
  });

  it("rejects an empty name", async () => {
    await expect(createPlaylist(db, "   ")).rejects.toThrow();
  });

  it("renames and bumps updatedAt", async () => {
    const p = await createPlaylist(db, "Old");
    await new Promise((r) => setTimeout(r, 2));
    await renamePlaylist(db, p.id, "New");
    const stored = await db.playlists.get(p.id);
    expect(stored?.name).toBe("New");
    expect(stored!.updatedAt).toBeGreaterThan(p.updatedAt);
  });

  it("tombstones on delete so the deletion can sync", async () => {
    const p = await createPlaylist(db, "Gone");
    await deletePlaylist(db, p.id);
    expect(await listPlaylists(db)).toHaveLength(0);
    expect((await db.playlists.get(p.id))?.deleted).toBe(true);
  });

  it("adds tracks in order and ignores duplicates", async () => {
    const p = await createPlaylist(db, "Set");
    await addToPlaylist(db, p.id, "a");
    await addToPlaylist(db, p.id, "b");
    await addToPlaylist(db, p.id, "a");
    expect((await db.playlists.get(p.id))?.trackIds).toEqual(["a", "b"]);
  });

  it("won't add to a deleted playlist", async () => {
    const p = await createPlaylist(db, "Set");
    await deletePlaylist(db, p.id);
    await addToPlaylist(db, p.id, "a");
    expect((await db.playlists.get(p.id))?.trackIds).toEqual([]);
  });

  it("removes a track", async () => {
    const p = await createPlaylist(db, "Set");
    await addToPlaylist(db, p.id, "a");
    await addToPlaylist(db, p.id, "b");
    await removeFromPlaylist(db, p.id, "a");
    expect((await db.playlists.get(p.id))?.trackIds).toEqual(["b"]);
  });

  it("reorders, clamping at the ends", async () => {
    const p = await createPlaylist(db, "Set");
    for (const id of ["a", "b", "c"]) await addToPlaylist(db, p.id, id);
    await moveInPlaylist(db, p.id, "c", -1);
    expect((await db.playlists.get(p.id))?.trackIds).toEqual(["a", "c", "b"]);
    await moveInPlaylist(db, p.id, "a", -5);
    expect((await db.playlists.get(p.id))?.trackIds).toEqual(["a", "c", "b"]);
    await moveInPlaylist(db, p.id, "a", 10);
    expect((await db.playlists.get(p.id))?.trackIds).toEqual(["c", "b", "a"]);
  });

  it("deleting a track scrubs it from every playlist", async () => {
    await db.tracks.put(track("a"));
    await db.tracks.put(track("b"));
    const p1 = await createPlaylist(db, "One");
    const p2 = await createPlaylist(db, "Two");
    await addToPlaylist(db, p1.id, "a");
    await addToPlaylist(db, p1.id, "b");
    await addToPlaylist(db, p2.id, "a");

    await deleteTrack(db, "a");

    expect(await db.tracks.get("a")).toBeUndefined();
    expect((await db.playlists.get(p1.id))?.trackIds).toEqual(["b"]);
    expect((await db.playlists.get(p2.id))?.trackIds).toEqual([]);
  });
});
