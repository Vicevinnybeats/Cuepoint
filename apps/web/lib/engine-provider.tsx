"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { EngineClient, decksStore } from "@cuepoint/engine";
import type { DecksStore } from "@cuepoint/engine";
import { emptySnapshot } from "@cuepoint/dsp";
import type { DeckSnapshot } from "@cuepoint/dsp";
import type { DeckId } from "@cuepoint/engine";
import { DECK_IDS } from "@cuepoint/engine";
import type { AnalyzeRequest, AnalyzeResult } from "@cuepoint/analysis";

type Target = DeckId | "master";
type FrameListener = (snapshot: DeckSnapshot) => void;

export interface AnalysisResult {
  bpm: number;
  /** Camelot wheel code, e.g. "8A". */
  key: string;
  peaks: Float32Array;
}

interface EngineContextValue {
  engine: EngineClient | null;
  connecting: boolean;
  error: string | null;
  /** Lazily creates the AudioContext and worklet graph. Must run from a user
   * gesture — browsers refuse to start audio otherwise. Idempotent. */
  connect: () => Promise<EngineClient>;
  onFrame: (target: Target, cb: FrameListener) => () => void;
  /** Runs BPM detection + waveform extraction off the main thread. Lazily
   * spins up the analysis worker on first call. */
  analyzeTrack: (samples: Float32Array, sampleRate: number) => Promise<AnalysisResult>;
}

const WAVEFORM_COLUMNS = 300;

/**
 * Pushes every commanded control value from the UI store into the engine.
 * Controls call the engine directly as they move, but only once it exists —
 * anything moved before the first tap created the AudioContext (or changed
 * by a sync pull) would otherwise be shown in the UI and ignored by audio.
 */
function applyStoreToEngine(client: EngineClient, state: DecksStore): void {
  for (const deck of DECK_IDS) {
    const d = state.decks[deck];
    client.setEq(deck, d.eqLow, d.eqMid, d.eqHigh);
    client.setFilter(deck, d.filter);
    client.setGain(deck, d.gain);
    client.setFader(deck, d.faderLevel);
    client.setRate(deck, 1 + d.tempoPercent / 100);
  }
  applyMixerToEngine(client, state);
}

function applyMixerToEngine(client: EngineClient, state: DecksStore): void {
  client.setCrossfader(state.mixer.crossfaderPosition);
  client.setCrossfaderCurve(state.mixer.crossfaderCurve);
  client.setMasterGain(state.mixer.masterGain);
  for (const deck of DECK_IDS) {
    client.setCrossfaderAssign(deck, state.mixer.crossfaderAssign[deck]);
  }
}

const EngineContext = createContext<EngineContextValue | null>(null);

export function EngineProvider({ children }: { children: React.ReactNode }) {
  const engineRef = useRef<EngineClient | null>(null);
  const connectPromiseRef = useRef<Promise<EngineClient> | null>(null);
  const [engine, setEngine] = useState<EngineClient | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const listenersRef = useRef<Record<Target, Set<FrameListener>>>({
    ...(Object.fromEntries(DECK_IDS.map((id) => [id, new Set<FrameListener>()])) as Record<
      DeckId,
      Set<FrameListener>
    >),
    master: new Set(),
  });
  // One reused snapshot object per target so the rAF loop allocates nothing.
  const snapshotsRef = useRef<Record<Target, DeckSnapshot>>({
    ...(Object.fromEntries(DECK_IDS.map((id) => [id, emptySnapshot()])) as Record<
      DeckId,
      DeckSnapshot
    >),
    master: emptySnapshot(),
  });

  const connect = useCallback(async (): Promise<EngineClient> => {
    if (engineRef.current) return engineRef.current;
    if (connectPromiseRef.current) return connectPromiseRef.current;

    setConnecting(true);
    setError(null);
    const promise = EngineClient.create({
      deckWorkletUrl: "/worklets/deck-processor.js",
      masterWorkletUrl: "/worklets/master-processor.js",
    })
      .then(async (client) => {
        await client.resume();
        applyStoreToEngine(client, decksStore.getState());
        engineRef.current = client;
        setEngine(client);
        setConnecting(false);
        return client;
      })
      .catch((e: unknown) => {
        connectPromiseRef.current = null;
        setConnecting(false);
        setError(e instanceof Error ? e.message : String(e));
        throw e;
      });
    connectPromiseRef.current = promise;
    return promise;
  }, []);

  const onFrame = useCallback((target: Target, cb: FrameListener) => {
    listenersRef.current[target].add(cb);
    return () => {
      listenersRef.current[target].delete(cb);
    };
  }, []);

  const analysisWorkerRef = useRef<Worker | null>(null);
  const analysisRequestsRef = useRef<Map<number, (result: AnalysisResult) => void>>(new Map());
  const nextRequestIdRef = useRef(0);

  const analyzeTrack = useCallback((samples: Float32Array, sampleRate: number): Promise<AnalysisResult> => {
    if (!analysisWorkerRef.current) {
      const worker = new Worker("/workers/worker.js", { type: "module" });
      worker.onmessage = (event: MessageEvent<AnalyzeResult>) => {
        const resolve = analysisRequestsRef.current.get(event.data.requestId);
        if (!resolve) return;
        analysisRequestsRef.current.delete(event.data.requestId);
        resolve({ bpm: event.data.bpm, key: event.data.key, peaks: new Float32Array(event.data.peaks) });
      };
      analysisWorkerRef.current = worker;
    }

    const requestId = nextRequestIdRef.current++;
    // A copy, since the worker takes ownership of this buffer via transfer
    // and the caller's Float32Array must stay usable afterwards.
    const channelData = samples.slice().buffer;
    return new Promise<AnalysisResult>((resolve) => {
      analysisRequestsRef.current.set(requestId, resolve);
      const request: AnalyzeRequest = {
        type: "analyze",
        requestId,
        channelData,
        sampleRate,
        waveformColumns: WAVEFORM_COLUMNS,
      };
      analysisWorkerRef.current?.postMessage(request, [channelData]);
    });
  }, []);

  useEffect(() => {
    return () => {
      analysisWorkerRef.current?.terminate();
    };
  }, []);

  // Mixer settings can change without anyone touching a control — a sync
  // pull replaces them wholesale — so mirror them into the engine whenever
  // they change. Local control changes also land here; resending the same
  // value is harmless (the worklet just re-targets its smoother).
  useEffect(
    () =>
      decksStore.subscribe((state, previous) => {
        const client = engineRef.current;
        if (client && state.mixer !== previous.mixer) applyMixerToEngine(client, state);
      }),
    [],
  );

  useEffect(() => {
    let frame = 0;
    const tick = () => {
      const client = engineRef.current;
      if (client) {
        for (const target of [...DECK_IDS, "master"] as const) {
          const listeners = listenersRef.current[target];
          if (listeners.size === 0) continue;
          const snapshot = snapshotsRef.current[target];
          client.reader(target).read(snapshot);
          for (const listener of listeners) listener(snapshot);
        }
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, []);

  const value = useMemo<EngineContextValue>(
    () => ({ engine, connecting, error, connect, onFrame, analyzeTrack }),
    [engine, connecting, error, connect, onFrame, analyzeTrack],
  );

  return <EngineContext.Provider value={value}>{children}</EngineContext.Provider>;
}

export function useEngine(): EngineContextValue {
  const ctx = useContext(EngineContext);
  if (!ctx) throw new Error("useEngine must be used within EngineProvider");
  return ctx;
}
