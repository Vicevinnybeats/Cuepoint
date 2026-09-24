"use client";

import { useCallback } from "react";
import { useStore } from "zustand/react";
import { decksStore } from "@cuepoint/engine";
import type { DeckId } from "@cuepoint/engine";
import { emptySnapshot } from "@cuepoint/dsp";
import { useEngine } from "@/lib/engine-provider";
import { cx } from "@/lib/cx";

const LOOP_BEATS = [1, 2, 4, 8, 16];

export function LoopControls({ deck }: { deck: DeckId }) {
  const { engine, connect } = useEngine();
  const state = useStore(decksStore, (s) => s.decks[deck]);
  const setLoopLength = useStore(decksStore, (s) => s.setLoopLength);

  const handleToggle = useCallback(
    async (beats: number) => {
      const client = engine ?? (await connect());

      if (state.loopLengthBeats === beats) {
        client.clearLoop(deck);
        setLoopLength(deck, null);
        return;
      }
      if (!state.track) return; // nothing loaded to loop

      const effectiveBpm = state.track.bpm * (1 + state.pitchPercent / 100);
      const snapshot = emptySnapshot();
      client.reader(deck).read(snapshot);
      // The context's real rate: assuming 48 kHz made every loop ~9% long on
      // a 44.1 kHz device, drifting off the beat.
      const framesPerBeat = (60 / effectiveBpm) * client.sampleRate;
      const start = snapshot.playheadFrames;
      client.setLoop(deck, start, start + framesPerBeat * beats);
      setLoopLength(deck, beats);
    },
    [connect, deck, engine, setLoopLength, state.loopLengthBeats, state.pitchPercent, state.track],
  );

  return (
    <div className="flex flex-col gap-1">
      <span className="text-[9px] font-medium uppercase tracking-wide text-neutral-500">
        Loop (beats)
      </span>
      <div className="grid grid-cols-5 gap-1.5">
        {LOOP_BEATS.map((beats) => (
          <button
            key={beats}
            type="button"
            className={cx(
              "h-10 rounded-sm border text-xs font-bold",
              state.loopLengthBeats === beats
                ? "border-transparent bg-amber text-black"
                : "border-deck-border text-neutral-400",
            )}
            onClick={() => void handleToggle(beats)}
          >
            {beats}
          </button>
        ))}
      </div>
    </div>
  );
}
