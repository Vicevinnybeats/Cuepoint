"use client";

import { useCallback, useEffect, useState } from "react";
import {
  getOrCreateSyncKey,
  setSyncKey,
  getWorkerUrl,
  setWorkerUrl,
  getAutoSync,
  setAutoSync,
  syncNow,
  watchSettingsChanges,
} from "@/lib/sync";

type Status =
  | { kind: "idle" }
  | { kind: "syncing" }
  | { kind: "done"; pushed: number; pulled: number; at: Date }
  | { kind: "error"; message: string };

const AUTO_SYNC_INTERVAL_MS = 60_000;

export function SyncPanel() {
  const [syncKey, setSyncKeyState] = useState("");
  const [workerUrl, setWorkerUrlState] = useState("");
  const [autoSync, setAutoSyncState] = useState(false);
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  useEffect(() => {
    watchSettingsChanges();
    setSyncKeyState(getOrCreateSyncKey());
    setWorkerUrlState(getWorkerUrl());
    setAutoSyncState(getAutoSync());
  }, []);

  const runSync = useCallback(async () => {
    if (!getWorkerUrl()) return;
    setStatus({ kind: "syncing" });
    try {
      const result = await syncNow();
      setStatus({ kind: "done", ...result, at: new Date() });
    } catch (error) {
      setStatus({ kind: "error", message: error instanceof Error ? error.message : String(error) });
    }
  }, []);

  // Auto-sync: on a timer, when the app comes back to the foreground (a
  // phone PWA spends most of its life backgrounded), and when the network
  // returns after being offline.
  useEffect(() => {
    if (!autoSync || !workerUrl) return;
    void runSync();
    const interval = setInterval(() => void runSync(), AUTO_SYNC_INTERVAL_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") void runSync();
    };
    const onOnline = () => void runSync();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", onOnline);
    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", onOnline);
    };
  }, [autoSync, workerUrl, runSync]);

  return (
    <div className="panel-surface flex flex-col gap-2 rounded-xl border border-deck-border p-3 text-[11px]">
      <span className="text-xs font-bold tracking-widest text-neutral-400">SYNC</span>
      <p className="text-neutral-500">
        Syncs cues, BPM/key, playlists and mixer settings between your own devices — never audio,
        which stays on the device that loaded it. Track details only update tracks already loaded on
        each device (matched by filename).
      </p>

      <label className="flex flex-col gap-1">
        <span className="text-neutral-500">Worker URL</span>
        <input
          className="min-h-9 rounded-sm border border-deck-border bg-panel-sunken px-2 py-1 text-neutral-200"
          placeholder="https://cuepoint-sync.your-subdomain.workers.dev"
          inputMode="url"
          autoCapitalize="off"
          autoCorrect="off"
          value={workerUrl}
          onChange={(e) => {
            setWorkerUrlState(e.target.value);
            setWorkerUrl(e.target.value);
          }}
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-neutral-500">Sync key — paste the same key on your other device</span>
        <div className="flex gap-1">
          <input
            className="min-h-9 min-w-0 flex-1 rounded-sm border border-deck-border bg-panel-sunken px-2 py-1 font-mono text-neutral-200"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            value={syncKey}
            onChange={(e) => {
              setSyncKeyState(e.target.value);
              setSyncKey(e.target.value);
            }}
          />
          <button
            type="button"
            className="min-h-9 rounded-sm border border-deck-border px-2.5 font-bold text-neutral-300"
            onClick={() => void navigator.clipboard?.writeText(syncKey)}
          >
            Copy
          </button>
        </div>
      </label>

      <label className="flex min-h-9 items-center gap-2 text-neutral-300">
        <input
          type="checkbox"
          className="h-4 w-4 accent-amber-400"
          checked={autoSync}
          disabled={!workerUrl}
          onChange={(e) => {
            setAutoSyncState(e.target.checked);
            setAutoSync(e.target.checked);
          }}
        />
        Sync automatically
      </label>

      <button
        type="button"
        className="min-h-11 rounded-md border border-deck-border bg-panel-raised py-2.5 text-xs font-bold uppercase text-neutral-200 disabled:opacity-50"
        onClick={() => void runSync()}
        disabled={status.kind === "syncing" || !workerUrl}
      >
        {status.kind === "syncing" ? "Syncing…" : "Sync Now"}
      </button>

      {status.kind === "done" && (
        <p className="text-green-400">
          Synced {status.at.toLocaleTimeString()} — sent {status.pushed}, received {status.pulled}.
        </p>
      )}
      {status.kind === "error" && <p className="text-red-400">{status.message}</p>}
    </div>
  );
}
