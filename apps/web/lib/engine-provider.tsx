"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { EngineClient } from "@cuepoint/engine";
import { emptySnapshot } from "@cuepoint/dsp";
import type { DeckSnapshot } from "@cuepoint/dsp";
import type { DeckId } from "@cuepoint/engine";

type Target = DeckId | "master";
type FrameListener = (snapshot: DeckSnapshot) => void;

interface EngineContextValue {
  engine: EngineClient | null;
  connecting: boolean;
  error: string | null;
  /** Lazily creates the AudioContext and worklet graph. Must run from a user
   * gesture — browsers refuse to start audio otherwise. Idempotent. */
  connect: () => Promise<EngineClient>;
  onFrame: (target: Target, cb: FrameListener) => () => void;
}

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
    () => ({ engine, connecting, error, connect, onFrame }),
    [engine, connecting, error, connect, onFrame],
  );

  return <EngineContext.Provider value={value}>{children}</EngineContext.Provider>;
}

export function useEngine(): EngineContextValue {
  const ctx = useContext(EngineContext);
  if (!ctx) throw new Error("useEngine must be used within EngineProvider");
  return ctx;
}
