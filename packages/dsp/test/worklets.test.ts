/**
 * Runs the real deck and master processors outside a browser, with a
 * minimal fake AudioWorkletGlobalScope, to test behaviour that only exists
 * at the processor level (channel separation, WASM selection, routing).
 */
import { describe, it, expect, beforeAll } from "vitest";
import { WasmEq3 } from "../src/wasm/wasm-eq3.js";
import { sine, SR } from "./helpers.js";

type Processor = {
  port: { onmessage: ((event: { data: unknown }) => void) | null; postMessage(m: unknown): void };
  process(inputs: Float32Array[][], outputs: Float32Array[][]): boolean;
};
type ProcessorCtor = new (options?: unknown) => Processor;

const registered = new Map<string, ProcessorCtor>();
const QUANTUM = 128;

beforeAll(async () => {
  const scope = globalThis as unknown as Record<string, unknown>;
  scope.sampleRate = SR;
  scope.AudioWorkletProcessor = class {
    port = { onmessage: null, postMessage() {} };
  };
  scope.registerProcessor = (name: string, ctor: ProcessorCtor) => registered.set(name, ctor);
  await import("../src/worklets/deck-processor.js");
  await import("../src/worklets/master-processor.js");
});

function send(p: Processor, data: unknown): void {
  p.port.onmessage?.({ data });
}

function runQuanta(p: Processor, quanta: number, inputs: Float32Array[][] = []) {
  const left: number[] = [];
  const right: number[] = [];
  for (let q = 0; q < quanta; q++) {
    const outL = new Float32Array(QUANTUM);
    const outR = new Float32Array(QUANTUM);
    p.process(inputs, [[outL, outR]]);
    left.push(...outL);
    right.push(...outR);
  }
  return { left, right };
}

function loadTrack(p: Processor, left: Float32Array, right: Float32Array): void {
  send(p, {
    type: "load",
    channels: [left.slice().buffer, right.slice().buffer],
    frames: left.length,
    sampleRate: SR,
    bpm: 120,
  });
}

const peakOf = (xs: number[]) => xs.reduce((m, x) => Math.max(m, Math.abs(x)), 0);

describe("deck-processor", () => {
  it("uses the WASM EQ when WebAssembly is available", () => {
    const deck = new (registered.get("deck-processor")!)({ processorOptions: {} });
    expect((deck as unknown as { eqL: unknown }).eqL).toBeInstanceOf(WasmEq3);
  });

  it("keeps left and right fully independent through EQ and filter", () => {
    // Loud left, silent right. With one filter shared across both channels,
    // the right channel inherited the left's filter memory at every block
    // boundary and leaked signal.
    const deck = new (registered.get("deck-processor")!)({ processorOptions: {} });
    loadTrack(deck, sine(1000, SR), new Float32Array(SR));
    send(deck, { type: "eq", low: 0.9, mid: 0.3, high: 0.8 });
    send(deck, { type: "filter", value: -0.6 });
    send(deck, { type: "play" });

    const { left, right } = runQuanta(deck, 100);
    expect(peakOf(left)).toBeGreaterThan(0.01);
    expect(peakOf(right)).toBe(0);
  });

  it("kills the bass through the whole processor chain", () => {
    const deck = new (registered.get("deck-processor")!)({ processorOptions: {} });
    const bass = sine(60, SR);
    loadTrack(deck, bass, bass);
    send(deck, { type: "play" });
    const open = peakOf(runQuanta(deck, 60).left.slice(-QUANTUM * 20));

    send(deck, { type: "eq", low: 0, mid: 0.5, high: 0.5 });
    const killed = peakOf(runQuanta(deck, 60).left.slice(-QUANTUM * 20));
    expect(killed).toBeLessThan(open * 0.05);
  });

  it("outputs silence until play", () => {
    const deck = new (registered.get("deck-processor")!)({ processorOptions: {} });
    const tone = sine(440, SR);
    loadTrack(deck, tone, tone);
    expect(peakOf(runQuanta(deck, 10).left)).toBe(0);
  });
});

describe("master-processor", () => {
  it("hard-left crossfader passes deck A and silences deck B", () => {
    const master = new (registered.get("master-processor")!)({ processorOptions: {} });
    send(master, { type: "crossfader", position: -1 });
    const a = new Float32Array(QUANTUM).fill(0.25);
    const b = new Float32Array(QUANTUM).fill(0.5);
    // Let the crossfader smoother settle, then measure.
    let last = runQuanta(master, 1, [[a, a], [b, b]]);
    for (let i = 0; i < 40; i++) last = runQuanta(master, 1, [[a, a], [b, b]]);
    expect(last.left[QUANTUM - 1]).toBeCloseTo(0.25, 3);
  });

  it("never outputs past the limiter ceiling", () => {
    const master = new (registered.get("master-processor")!)({ processorOptions: {} });
    const loud = new Float32Array(QUANTUM).fill(1);
    const { left } = runQuanta(master, 50, [[loud, loud], [loud, loud]]);
    expect(peakOf(left)).toBeLessThanOrEqual(0.99 + 1e-6);
  });

  it("channels C and D default to thru — audible regardless of crossfader position", () => {
    const master = new (registered.get("master-processor")!)({ processorOptions: {} });
    send(master, { type: "crossfader", position: -1 }); // hard left: would silence a B-side channel
    const silent = new Float32Array(QUANTUM);
    const c = new Float32Array(QUANTUM).fill(0.2);
    let last = runQuanta(master, 1, [[silent, silent], [silent, silent], [c, c]]);
    for (let i = 0; i < 40; i++) {
      last = runQuanta(master, 1, [[silent, silent], [silent, silent], [c, c]]);
    }
    expect(last.left[QUANTUM - 1]).toBeCloseTo(0.2, 3);
  });

  it("reassigning a channel to a crossfader side takes effect", () => {
    const master = new (registered.get("master-processor")!)({ processorOptions: {} });
    send(master, { type: "crossfader", position: 1 }); // hard right
    const c = new Float32Array(QUANTUM).fill(0.3);
    const silence = new Float32Array(QUANTUM);
    const settle = () => {
      let last = runQuanta(master, 1, [[silence, silence], [silence, silence], [c, c]]);
      for (let i = 0; i < 40; i++) {
        last = runQuanta(master, 1, [[silence, silence], [silence, silence], [c, c]]);
      }
      return last;
    };

    expect(settle().left[QUANTUM - 1]).toBeCloseTo(0.3, 3); // thru: unaffected

    send(master, { type: "crossfaderAssign", channel: 2, assign: "A" });
    expect(settle().left[QUANTUM - 1]).toBeCloseTo(0, 3); // A-side, but fader is hard right
  });

  it("sums all four channels", () => {
    const master = new (registered.get("master-processor")!)({ processorOptions: {} });
    const each = new Float32Array(QUANTUM).fill(0.1);
    const { left } = runQuanta(master, 1, [
      [each, each],
      [each, each],
      [each, each],
      [each, each],
    ]);
    expect(left[0]).toBeCloseTo(0.4, 3);
  });
});
