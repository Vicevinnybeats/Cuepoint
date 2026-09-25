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

const STEPS = [
  "SoundCloud isn't issuing new API keys publicly anymore — request a Client ID at soundcloud.com/you/apps (approval isn't guaranteed or instant).",
  "Once you have one, paste it below.",
  "Connect — you'll approve access to your likes and uploads on SoundCloud's own page.",
  "Import any track straight into your Cuepoint library.",
];

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
  const [importingId, setImportingId] = useState<number | null>(null);

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

  const handleImport = useCallback(
    async (track: SoundCloudTrack) => {
      setImportingId(track.id);
      setError(null);
      try {
        const audioBlob = await downloadTrackAudio(track);
        const client = engine ?? (await connect());
        const buffer = await audioBlob.arrayBuffer();
        const decoded = await client.decode(buffer);
        const { bpm, key, peaks } = await analyzeTrack(decoded.getChannelData(0), decoded.sampleRate);
        await db.tracks.put({
          id: `soundcloud-${track.id}`,
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
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setImportingId(null);
      }
    },
    [analyzeTrack, connect, engine],
  );

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
                  {STEPS.map((step, i) => (
                    <li key={step} className="list-decimal">
                      {i === 0 ? (
                        <>
                          SoundCloud isn&apos;t issuing new API keys publicly anymore — request a
                          Client ID at <span className="text-amber">soundcloud.com/you/apps</span>{" "}
                          (approval isn&apos;t guaranteed or instant).
                        </>
                      ) : (
                        step
                      )}
                    </li>
                  ))}
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
                  <div className="flex max-h-56 flex-col gap-1 overflow-y-auto">
                    {tracks.map((t) => (
                      <div
                        key={t.id}
                        className="flex items-center justify-between gap-2 rounded-md bg-panel-sunken px-2 py-1"
                      >
                        <span className="min-w-0 flex-1 truncate text-xs text-neutral-200">{t.title}</span>
                        <button
                          type="button"
                          disabled={importingId === t.id || !t.transcodingUrl}
                          onClick={() => void handleImport(t)}
                          className="min-h-8 shrink-0 rounded-sm border border-deck-border px-2.5 text-[10px] font-bold uppercase text-neutral-300 disabled:opacity-30"
                          title={
                            !t.transcodingUrl
                              ? "This track only has an HLS stream, which isn't supported yet"
                              : "Import into your library"
                          }
                        >
                          {importingId === t.id ? "…" : "Import"}
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
