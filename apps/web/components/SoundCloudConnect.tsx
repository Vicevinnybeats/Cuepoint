"use client";

import { useCallback, useEffect, useState } from "react";
import { db } from "@cuepoint/library";
import { useEngine } from "@/lib/engine-provider";
import {
  getClientId,
  setClientId,
  isConnected,
  disconnect,
  beginConnect,
  fetchLikes,
  fetchUploads,
  downloadTrackAudio,
} from "@/lib/soundcloud";
import type { SoundCloudTrack } from "@/lib/soundcloud";
import { cx } from "@/lib/cx";

type Status = "disconnected" | "connecting" | "connected" | "error";

/** Connect button + status indicator + step explainer, and — once
 * connected — a browser for the account's likes/uploads with an Import
 * button per track. See lib/soundcloud.ts for the important caveat: this
 * hasn't been tested against a live SoundCloud app from this environment. */
export function SoundCloudConnect() {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<Status>("disconnected");
  const [clientIdInput, setClientIdInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<"likes" | "uploads">("likes");
  const [tracks, setTracks] = useState<SoundCloudTrack[]>([]);
  const [loadingTracks, setLoadingTracks] = useState(false);
  const [importingUrn, setImportingUrn] = useState<string | null>(null);
  const [importedUrns, setImportedUrns] = useState<Set<string>>(new Set());
  const [bulkProgress, setBulkProgress] = useState<{ done: number; total: number; failed: number } | null>(
    null,
  );

  const { engine, connect, analyzeTrack } = useEngine();

  useEffect(() => {
    setClientIdInput(getClientId() ?? "");
    setStatus(isConnected() ? "connected" : "disconnected");
  }, []);

  const handleConnect = useCallback(async () => {
    setError(null);
    setClientId(clientIdInput.trim());
    try {
      setStatus("connecting");
      await beginConnect(`${window.location.origin}/soundcloud-callback`);
    } catch (e) {
      setStatus("error");
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [clientIdInput]);

  const handleDisconnect = useCallback(() => {
    disconnect();
    setStatus("disconnected");
    setTracks([]);
    setImportedUrns(new Set());
  }, []);

  const loadList = useCallback(async (which: "likes" | "uploads") => {
    setLoadingTracks(true);
    setError(null);
    try {
      setTracks(which === "likes" ? await fetchLikes() : await fetchUploads());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoadingTracks(false);
    }
  }, []);

  useEffect(() => {
    if (open && status === "connected") void loadList(tab);
  }, [open, status, tab, loadList]);

  /** Downloads and saves one track, without touching per-track UI state —
   * the two callers (single Import click, bulk Import All) each track
   * progress their own way. Throws on failure; callers decide what that
   * means for them. */
  const importOne = useCallback(
    async (track: SoundCloudTrack) => {
      const audioBlob = await downloadTrackAudio(track);
      const client = engine ?? (await connect());
      const buffer = await audioBlob.arrayBuffer();
      const decoded = await client.decode(buffer);
      const { bpm, key, peaks } = await analyzeTrack(decoded.getChannelData(0), decoded.sampleRate);
      await db.tracks.put({
        id: track.urn,
        title: track.title,
        artist: "SoundCloud",
        bpm,
        key,
        durationSeconds: decoded.duration,
        waveform: peaks,
        audio: audioBlob,
        cues: [],
        mainCue: 0,
        addedAt: Date.now(),
        updatedAt: Date.now(),
      });
    },
    [analyzeTrack, connect, engine],
  );

  const handleImport = useCallback(
    async (track: SoundCloudTrack) => {
      setImportingUrn(track.urn);
      setError(null);
      try {
        await importOne(track);
        setImportedUrns((prev) => new Set(prev).add(track.urn));
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setImportingUrn(null);
      }
    },
    [importOne],
  );

  /** Imports every not-yet-imported track in the current list, one at a
   * time (the engine has a single AudioContext to decode through) rather
   * than requiring a click per track. Keeps going past individual failures
   * so one broken track doesn't stop the rest of the list. */
  const handleImportAll = useCallback(async () => {
    const pending = tracks.filter((t) => !importedUrns.has(t.urn));
    if (pending.length === 0) return;
    setError(null);
    let done = 0;
    let failed = 0;
    setBulkProgress({ done, total: pending.length, failed });
    for (const track of pending) {
      setImportingUrn(track.urn);
      try {
        await importOne(track);
        setImportedUrns((prev) => new Set(prev).add(track.urn));
      } catch (e) {
        failed += 1;
        console.error(`SoundCloud import failed for "${track.title}":`, e);
      }
      done += 1;
      setBulkProgress({ done, total: pending.length, failed });
    }
    setImportingUrn(null);
    if (failed > 0) {
      setError(`Imported ${pending.length - failed}/${pending.length} — ${failed} failed (see console).`);
    }
    setBulkProgress(null);
  }, [tracks, importedUrns, importOne]);

  const redirectUri = typeof window !== "undefined" ? `${window.location.origin}/soundcloud-callback` : "";

  const indicatorClass =
    status === "connected"
      ? "bg-green-500"
      : status === "connecting"
        ? "bg-amber animate-pulse"
        : status === "error"
          ? "bg-red-500"
          : "bg-neutral-600";

  const statusLabel =
    status === "connected" ? "Connected" : status === "connecting" ? "Connecting…" : status === "error" ? "Error" : "Not connected";

  return (
    <div className="flex flex-col gap-1 rounded-md border border-deck-border bg-panel-sunken p-2">
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-center justify-between gap-2 text-[11px] font-bold uppercase text-neutral-300"
      >
        <span className="flex items-center gap-1.5">
          <span className={cx("h-2 w-2 rounded-full", indicatorClass)} aria-hidden="true" />
          SoundCloud
        </span>
        <span className="text-neutral-500">{statusLabel}</span>
      </button>

      {open && (
        <div
          className="fixed inset-0 z-40 flex items-center justify-center bg-black/70 p-6"
          onClick={() => setOpen(false)}
        >
          <div
            className="flex w-full max-w-sm flex-col gap-3 rounded-xl border border-deck-border bg-panel p-4 shadow-panel"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <span className="text-sm font-bold tracking-widest text-neutral-300">SOUNDCLOUD</span>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-md border border-deck-border bg-panel-raised px-2.5 py-1 text-[10px] font-bold uppercase text-neutral-400"
              >
                Close
              </button>
            </div>

            {status !== "connected" ? (
              <div className="flex flex-col gap-3">
                <ol className="flex flex-col gap-2 pl-4 text-xs text-neutral-400">
                  <li className="list-decimal">
                    Get a Client ID — sign in and register an app at{" "}
                    <span className="text-amber">soundcloud.com/you/apps</span>. Usually free and
                    instant; a small number of accounts get asked for an Artist Pro subscription.
                  </li>
                  <li className="list-decimal">
                    On that same page, set the app&apos;s <strong>Redirect URI</strong> to exactly:
                    <br />
                    <code className="break-all text-amber">{redirectUri}</code>
                  </li>
                  <li className="list-decimal">Paste the Client ID below.</li>
                  <li className="list-decimal">
                    Connect — you&apos;ll approve access to your likes and uploads on
                    SoundCloud&apos;s own page.
                  </li>
                  <li className="list-decimal">Import any track straight into your Cuepoint library.</li>
                </ol>
                <input
                  value={clientIdInput}
                  onChange={(e) => setClientIdInput(e.target.value)}
                  onBlur={() => setClientId(clientIdInput.trim())}
                  placeholder="SoundCloud Client ID"
                  className="min-h-9 rounded-sm border border-deck-border bg-panel-sunken px-2 text-xs text-neutral-200"
                />
                <button
                  type="button"
                  disabled={!clientIdInput.trim() || status === "connecting"}
                  onClick={() => void handleConnect()}
                  className="min-h-9 rounded-md bg-accent text-xs font-bold uppercase text-black disabled:opacity-40"
                >
                  {status === "connecting" ? "Connecting…" : "Connect to SoundCloud"}
                </button>
                {error && <p className="text-xs text-red-400">{error}</p>}
                <p className="text-[10px] text-neutral-600">
                  Web app only — the desktop app can&apos;t receive an OAuth redirect.
                </p>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <div className="flex gap-1">
                    {(["likes", "uploads"] as const).map((t) => (
                      <button
                        key={t}
                        type="button"
                        onClick={() => setTab(t)}
                        className={cx(
                          "min-h-8 rounded-sm border px-2.5 text-[10px] font-bold uppercase",
                          tab === t
                            ? "border-transparent bg-amber text-black"
                            : "border-deck-border text-neutral-400",
                        )}
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={handleDisconnect}
                    className="text-[10px] font-semibold uppercase text-red-400 underline"
                  >
                    Disconnect
                  </button>
                </div>
                {error && <p className="text-xs text-red-400">{error}</p>}
                {loadingTracks ? (
                  <p className="py-2 text-center text-xs text-neutral-600">Loading…</p>
                ) : tracks.length === 0 ? (
                  <p className="py-2 text-center text-xs text-neutral-600">No tracks found.</p>
                ) : (
                  <>
                    <div className="flex items-center justify-between gap-2">
                      <button
                        type="button"
                        disabled={
                          bulkProgress !== null ||
                          importingUrn !== null ||
                          tracks.every((t) => importedUrns.has(t.urn))
                        }
                        onClick={() => void handleImportAll()}
                        className="min-h-8 rounded-sm border border-deck-border bg-panel-raised px-2.5 text-[10px] font-bold uppercase text-neutral-300 disabled:opacity-30"
                      >
                        {bulkProgress
                          ? `Importing ${bulkProgress.done}/${bulkProgress.total}…`
                          : "Import all"}
                      </button>
                      <span className="text-[10px] text-neutral-600">
                        {importedUrns.size > 0 && `${importedUrns.size} imported`}
                      </span>
                    </div>
                    <div className="flex max-h-56 flex-col gap-1 overflow-y-auto">
                      {tracks.map((t) => {
                        const imported = importedUrns.has(t.urn);
                        return (
                          <div
                            key={t.urn}
                            className="flex items-center justify-between gap-2 rounded-md bg-panel-sunken px-2 py-1"
                          >
                            <span className="min-w-0 flex-1 truncate text-xs text-neutral-200">{t.title}</span>
                            <button
                              type="button"
                              disabled={imported || importingUrn === t.urn}
                              onClick={() => void handleImport(t)}
                              className="min-h-8 shrink-0 rounded-sm border border-deck-border px-2.5 text-[10px] font-bold uppercase text-neutral-300 disabled:opacity-30"
                              title={imported ? "Already imported" : "Import into your library"}
                            >
                              {importingUrn === t.urn ? "…" : imported ? "Imported" : "Import"}
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
