import type { LibraryDB, Playlist } from "./db.js";

function newId(): string {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return `pl_${Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")}`;
}

/** Live (non-deleted) playlists, alphabetical. */
export async function listPlaylists(db: LibraryDB): Promise<Playlist[]> {
  const all = await db.playlists.toArray();
  return all.filter((p) => !p.deleted).sort((a, b) => a.name.localeCompare(b.name));
}

export async function createPlaylist(db: LibraryDB, name: string): Promise<Playlist> {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Playlist name can't be empty.");
  const now = Date.now();
  const playlist: Playlist = {
    id: newId(),
    name: trimmed,
    trackIds: [],
    createdAt: now,
    updatedAt: now,
    deleted: false,
  };
  await db.playlists.put(playlist);
  return playlist;
}

export async function renamePlaylist(db: LibraryDB, id: string, name: string): Promise<void> {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Playlist name can't be empty.");
  await db.playlists.update(id, { name: trimmed, updatedAt: Date.now() });
}

export async function deletePlaylist(db: LibraryDB, id: string): Promise<void> {
  await db.playlists.update(id, { deleted: true, trackIds: [], updatedAt: Date.now() });
}

/** Appends a track; adding one that's already present is a no-op. */
export async function addToPlaylist(db: LibraryDB, playlistId: string, trackId: string): Promise<void> {
  await db.transaction("rw", db.playlists, async () => {
    const playlist = await db.playlists.get(playlistId);
    if (!playlist || playlist.deleted || playlist.trackIds.includes(trackId)) return;
    await db.playlists.update(playlistId, {
      trackIds: [...playlist.trackIds, trackId],
      updatedAt: Date.now(),
    });
  });
}

export async function removeFromPlaylist(db: LibraryDB, playlistId: string, trackId: string): Promise<void> {
  await db.transaction("rw", db.playlists, async () => {
    const playlist = await db.playlists.get(playlistId);
    if (!playlist) return;
    await db.playlists.update(playlistId, {
      trackIds: playlist.trackIds.filter((id) => id !== trackId),
      updatedAt: Date.now(),
    });
  });
}

/** Moves a track within a playlist by `delta` positions, clamped to bounds. */
export async function moveInPlaylist(
  db: LibraryDB,
  playlistId: string,
  trackId: string,
  delta: number,
): Promise<void> {
  await db.transaction("rw", db.playlists, async () => {
    const playlist = await db.playlists.get(playlistId);
    if (!playlist) return;
    const from = playlist.trackIds.indexOf(trackId);
    if (from === -1) return;
    const to = Math.min(Math.max(from + delta, 0), playlist.trackIds.length - 1);
    if (to === from) return;
    const trackIds = [...playlist.trackIds];
    trackIds.splice(from, 1);
    trackIds.splice(to, 0, trackId);
    await db.playlists.update(playlistId, { trackIds, updatedAt: Date.now() });
  });
}

/** Deletes a track and scrubs it from every playlist that referenced it. */
export async function deleteTrack(db: LibraryDB, trackId: string): Promise<void> {
  await db.transaction("rw", db.tracks, db.playlists, async () => {
    await db.tracks.delete(trackId);
    const containing = await db.playlists.filter((p) => p.trackIds.includes(trackId)).toArray();
    const now = Date.now();
    for (const playlist of containing) {
      await db.playlists.update(playlist.id, {
        trackIds: playlist.trackIds.filter((id) => id !== trackId),
        updatedAt: now,
      });
    }
  });
}
