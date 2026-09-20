"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { EngineClient } from "@cuepoint/engine";
import { emptySnapshot } from "@cuepoint/dsp";
import type { DeckSnapshot } from "@cuepoint/dsp";
import type { DeckId } from "@cuepoint/engine";
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

const EngineContext = createContext<EngineContextValue | null>(null);

export function EngineProvider({ children }: { children: React.ReactNode }) {
  const engineRef = useRef<EngineClient | null>(null);
  const connectPromiseRef = useRef<Promise<EngineClient> | null>(null);
  const [engine, setEngine] = useState<EngineClient | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const listenersRef = useRef<Record<Target, Set<FrameListener>>>({
    A: new Set(),
    B: new Set(),
    master: new Set(),
  });
  // One reused snapshot object per target so the rAF loop allocates nothing.
  const snapshotsRef = useRef<Record<Target, DeckSnapshot>>({
    A: emptySnapshot(),
    B: emptySnapshot(),
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

  useEffect(() => {
    let frame = 0;
    const tick = () => {
      const client = engineRef.current;
      if (client) {
        for (const target of ["A", "B", "master"] as const) {
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
