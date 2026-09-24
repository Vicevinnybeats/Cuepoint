"use client";

import { SyncClient, generateSyncKey, remoteWins } from "@cuepoint/sync";
import type { PulledItem } from "@cuepoint/sync";
import { db } from "@cuepoint/library";
import type { StoredTrack, Playlist } from "@cuepoint/library";
import { decksStore } from "@cuepoint/engine";
import type { MixerUiState } from "@cuepoint/engine";

const SYNC_KEY_STORAGE = "cuepoint.syncKey";
const WORKER_URL_STORAGE = "cuepoint.syncWorkerUrl";
const LAST_PUSHED_STORAGE = "cuepoint.lastPushedAt";
const SETTINGS_UPDATED_STORAGE = "cuepoint.settingsUpdatedAt";
const AUTO_SYNC_STORAGE = "cuepoint.autoSync";
const cursorKey = (collection: string) => `cuepoint.cursor.${collection}`;

const SETTINGS_ID = "app-settings";

export function getOrCreateSyncKey(): string {
  const existing = localStorage.getItem(SYNC_KEY_STORAGE);
  if (existing) return existing;
  const key = generateSyncKey();
  localStorage.setItem(SYNC_KEY_STORAGE, key);
  return key;
}

export function setSyncKey(key: string): void {
  const previous = localStorage.getItem(SYNC_KEY_STORAGE);
  localStorage.setItem(SYNC_KEY_STORAGE, key);
  // A different key is a different account: cursors from the old one would
  // skip everything the new one already holds, and "last pushed" would
  // hold back local changes the new one has never seen.
  if (previous !== key) resetSyncProgress();
}

export function getWorkerUrl(): string {
  return localStorage.getItem(WORKER_URL_STORAGE) ?? "";
}

export function setWorkerUrl(url: string): void {
  localStorage.setItem(WORKER_URL_STORAGE, url.trim().replace(/\/$/, ""));
}

export function getAutoSync(): boolean {
  return localStorage.getItem(AUTO_SYNC_STORAGE) === "1";
}

export function setAutoSync(enabled: boolean): void {
  localStorage.setItem(AUTO_SYNC_STORAGE, enabled ? "1" : "0");
}

function resetSyncProgress(): void {
  for (const collection of ["tracks", "playlists", "settings"]) {
    localStorage.removeItem(cursorKey(collection));
  }
  localStorage.removeItem(LAST_PUSHED_STORAGE);
}

function readNumber(key: string): number {
  return Number(localStorage.getItem(key) ?? "0") || 0;
}

// --- Settings timestamps -------------------------------------------------
// Mixer settings live in the Zustand store, not IndexedDB, so they have no
// updatedAt of their own. Stamp one whenever the mixer changes locally —
// pushing them with Date.now() on every sync would make whichever device
// pressed Sync last win, regardless of which one actually changed them.

let applyingRemoteSettings = false;
let settingsWatchStarted = false;

export function watchSettingsChanges(): void {
  if (settingsWatchStarted) return;
  settingsWatchStarted = true;
  decksStore.subscribe((state, previous) => {
    if (state.mixer === previous.mixer || applyingRemoteSettings) return;
    localStorage.setItem(SETTINGS_UPDATED_STORAGE, String(Date.now()));
  });
}

type TrackMetadata = Omit<StoredTrack, "audio" | "waveform">;

function trackMetadata(track: StoredTrack): TrackMetadata {
  return {
    id: track.id,
    title: track.title,
    artist: track.artist,
    bpm: track.bpm,
    key: track.key,
    durationSeconds: track.durationSeconds,
    cues: track.cues,
    addedAt: track.addedAt,
    updatedAt: track.updatedAt,
  };
}

export interface SyncResult {
  pushed: number;
  pulled: number;
}

let inFlight: Promise<SyncResult> | null = null;

/**
 * Push local changes, then pull everything the server received since this
 * device last pulled.
 *
 * - Tracks: only metadata and cues sync, never audio. A remote track record
 *   only updates a track that already exists locally (matched by id, which
 *   comes from filename + last-modified) — it never creates a library entry,
 *   since there'd be no audio behind it on this device.
 * - Playlists: sync fully, including deletions (tombstones). Entries for
 *   tracks this device doesn't have are kept but not shown.
 * - Mixer settings: one record, last change wins.
 *
 * Concurrent calls share one run, so auto-sync and a manual press can't race
 * each other into double pushes.
 */
export function syncNow(): Promise<SyncResult> {
  inFlight ??= runSync().finally(() => {
    inFlight = null;
  });
  return inFlight;
}

async function runSync(): Promise<SyncResult> {
  const workerUrl = getWorkerUrl();
  if (!workerUrl) throw new Error("No sync worker URL configured.");
  const client = new SyncClient(workerUrl, getOrCreateSyncKey());

  // Push. Local timestamps are compared against a local "last pushed"
  // mark, so this device's own clock is the only one involved here.
  const pushStartedAt = Date.now();
  const lastPushed = readNumber(LAST_PUSHED_STORAGE);

  const tracks = (await db.tracks.toArray()).filter((t) => t.updatedAt > lastPushed);
  await client.push(
    "tracks",
    tracks.map((t) => ({ id: t.id, data: trackMetadata(t), updatedAt: t.updatedAt })),
  );

  const playlists = (await db.playlists.toArray()).filter((p) => p.updatedAt > lastPushed);
  await client.push(
    "playlists",
    playlists.map((p) => ({ id: p.id, data: p, updatedAt: p.updatedAt, deleted: p.deleted })),
  );

  const settingsUpdatedAt = readNumber(SETTINGS_UPDATED_STORAGE);
  const pushSettings = settingsUpdatedAt > lastPushed;
  if (pushSettings) {
    await client.push("settings", [
      { id: SETTINGS_ID, data: decksStore.getState().mixer, updatedAt: settingsUpdatedAt },
    ]);
  }
  localStorage.setItem(LAST_PUSHED_STORAGE, String(pushStartedAt));

  // Pull. Cursors are the server's clock, so an edit another device made
  // offline and pushed later is still picked up.
  let pulled = 0;
  pulled += await pullCollection(client, "tracks", applyTrack);
  pulled += await pullCollection(client, "playlists", applyPlaylist);
  pulled += await pullCollection(client, "settings", applySettings);

  return { pushed: tracks.length + playlists.length + (pushSettings ? 1 : 0), pulled };
}

async function pullCollection(
  client: SyncClient,
  collection: string,
  apply: (item: PulledItem) => Promise<void>,
): Promise<number> {
  const { items, cursor } = await client.pullAll(collection, readNumber(cursorKey(collection)));
  for (const item of items) await apply(item);
  localStorage.setItem(cursorKey(collection), String(cursor));
  return items.length;
}

async function applyTrack(item: PulledItem): Promise<void> {
  const local = await db.tracks.get(item.id);
  if (!local) return; // no local audio for this track — nothing to update
  const remote = JSON.parse(item.data) as TrackMetadata;
  if (!remoteWins(local.updatedAt, remote.updatedAt)) return;
  await db.tracks.update(item.id, {
    title: remote.title,
    artist: remote.artist,
    bpm: remote.bpm,
    key: remote.key,
    durationSeconds: remote.durationSeconds,
    cues: remote.cues,
    updatedAt: remote.updatedAt,
  });
}

async function applyPlaylist(item: PulledItem): Promise<void> {
  const remote = JSON.parse(item.data) as Playlist;
  const local = await db.playlists.get(item.id);
  if (!remoteWins(local?.updatedAt, remote.updatedAt)) return;
  await db.playlists.put({ ...remote, deleted: remote.deleted || item.deleted === 1 });
}

async function applySettings(item: PulledItem): Promise<void> {
  if (item.id !== SETTINGS_ID) return;
  if (!remoteWins(readNumber(SETTINGS_UPDATED_STORAGE), item.updatedAt)) return;
  const remote = JSON.parse(item.data) as MixerUiState;
  applyingRemoteSettings = true;
  try {
    decksStore.setState({ mixer: remote });
  } finally {
    applyingRemoteSettings = false;
  }
  localStorage.setItem(SETTINGS_UPDATED_STORAGE, String(item.updatedAt));
}
