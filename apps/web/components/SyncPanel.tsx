"use client";

import { useEffect, useState } from "react";
import { getOrCreateSyncKey, setSyncKey, getWorkerUrl, setWorkerUrl, syncNow } from "@/lib/sync";

type Status = { kind: "idle" } | { kind: "syncing" } | { kind: "done"; pushed: number; pulled: number } | { kind: "error"; message: string };

export function SyncPanel() {
  const [syncKey, setSyncKeyState] = useState("");
  const [workerUrl, setWorkerUrlState] = useState("");
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  useEffect(() => {
    setSyncKeyState(getOrCreateSyncKey());
    setWorkerUrlState(getWorkerUrl());
  }, []);

  const handleSync = async () => {
    setStatus({ kind: "syncing" });
    try {
      const result = await syncNow();
      setStatus({ kind: "done", ...result });
    } catch (error) {
      setStatus({ kind: "error", message: error instanceof Error ? error.message : String(error) });
    }
  };

  return (
    <div className="panel-surface flex flex-col gap-2 rounded-xl border border-deck-border p-3 text-[11px]">
      <span className="text-xs font-bold tracking-widest text-neutral-400">SYNC</span>
      <p className="text-neutral-500">
        Syncs track BPM/key/cues and mixer settings between your own devices — never audio, it
        stays on the device that loaded it. Updates only tracks already loaded locally on each
        device (matched by filename); it doesn&apos;t create new library entries.
      </p>

      <label className="flex flex-col gap-1">
        <span className="text-neutral-500">Worker URL</span>
        <input
          className="rounded-sm border border-deck-border bg-panel-sunken px-2 py-1 text-neutral-200"
          placeholder="https://cuepoint-sync.your-subdomain.workers.dev"
          value={workerUrl}
          onChange={(e) => {
            setWorkerUrlState(e.target.value);
            setWorkerUrl(e.target.value);
          }}
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-neutral-500">Sync key (copy to your other device)</span>
        <input
          className="rounded-sm border border-deck-border bg-panel-sunken px-2 py-1 font-mono text-neutral-200"
          value={syncKey}
          onChange={(e) => {
            setSyncKeyState(e.target.value);
            setSyncKey(e.target.value);
          }}
        />
      </label>

      <button
        type="button"
        className="rounded-md border border-deck-border bg-panel-raised py-1.5 text-xs font-bold uppercase text-neutral-200 disabled:opacity-50"
        onClick={() => void handleSync()}
        disabled={status.kind === "syncing" || !workerUrl}
      >
        {status.kind === "syncing" ? "Syncing…" : "Sync Now"}
      </button>

      {status.kind === "done" && (
        <p className="text-green-400">
          Synced — pushed {status.pushed}, pulled {status.pulled}.
        </p>
      )}
      {status.kind === "error" && <p className="text-red-400">{status.message}</p>}
    </div>
  );
}
