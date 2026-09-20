"use client";

import { SyncClient, generateSyncKey } from "@cuepoint/sync";
import { db } from "@cuepoint/library";
import type { StoredTrack } from "@cuepoint/library";
import { decksStore } from "@cuepoint/engine";
import type { MixerUiState } from "@cuepoint/engine";

const SYNC_KEY_STORAGE = "cuepoint.syncKey";
const WORKER_URL_STORAGE = "cuepoint.syncWorkerUrl";
const LAST_SYNCED_STORAGE = "cuepoint.lastSyncedAt";

export function getOrCreateSyncKey(): string {
  const existing = localStorage.getItem(SYNC_KEY_STORAGE);
  if (existing) return existing;
  const key = generateSyncKey();
  localStorage.setItem(SYNC_KEY_STORAGE, key);
  return key;
}

export function setSyncKey(key: string): void {
  localStorage.setItem(SYNC_KEY_STORAGE, key);
}

export function getWorkerUrl(): string {
  return localStorage.getItem(WORKER_URL_STORAGE) ?? "";
}

export function setWorkerUrl(url: string): void {
  localStorage.setItem(WORKER_URL_STORAGE, url.replace(/\/$/, ""));
}

export function getLastSyncedAt(): number {
  return Number(localStorage.getItem(LAST_SYNCED_STORAGE) ?? "0");
}

type TrackMetadata = Omit<StoredTrack, "audio" | "waveform">;

/**
 * Pushes local track metadata + cues and app settings, then pulls remote
 * changes newer than the last sync.
 *
 * Sync only updates tracks that already exist locally (matched by id, which
 * is derived from filename + last-modified) — it never creates a library
 * entry from a remote record, because the audio itself never leaves the
 * device it was loaded on. Load the same file on each device once; sync
 * then keeps BPM/key/cues in step between them.
 */
export async function syncNow(): Promise<{ pushed: number; pulled: number }> {
  const workerUrl = getWorkerUrl();
  if (!workerUrl) throw new Error("No sync worker URL configured.");
  const syncKey = getOrCreateSyncKey();
  const client = new SyncClient(workerUrl, syncKey);
  const since = getLastSyncedAt();

  const tracks = await db.tracks.toArray();
  const trackRecords = tracks.map((track) => {
    const metadata: TrackMetadata = {
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
    return { id: track.id, data: metadata, updatedAt: track.updatedAt };
  });
  const settings = decksStore.getState().mixer;
  await client.push("tracks", trackRecords);
  await client.push("settings", [{ id: "app-settings", data: settings, updatedAt: Date.now() }]);

  const pulledTracks = await client.pull("tracks", since);
  for (const item of pulledTracks) {
    const local = await db.tracks.get(item.id);
    if (!local) continue; // no local audio for this track — nothing to update
    const remote = JSON.parse(item.data) as TrackMetadata;
    if (remote.updatedAt <= local.updatedAt) continue;
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

  const pulledSettings = await client.pull("settings", since);
  const settingsItem = pulledSettings.find((item) => item.id === "app-settings");
  if (settingsItem) {
    const remoteSettings = JSON.parse(settingsItem.data) as MixerUiState;
    decksStore.setState({ mixer: remoteSettings });
  }

  localStorage.setItem(LAST_SYNCED_STORAGE, String(Date.now()));
  return { pushed: trackRecords.length, pulled: pulledTracks.length };
}
