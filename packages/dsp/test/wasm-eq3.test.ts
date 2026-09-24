import { describe, it, expect } from "vitest";
import { Eq3 } from "../src/kernels/eq3.js";
import { WasmDsp } from "../src/wasm/wasm-dsp.js";
import { WasmEq3 } from "../src/wasm/wasm-eq3.js";
import { EQ3_WASM_BYTES } from "../src/wasm/eq3-wasm.generated.js";
// @ts-expect-error — plain .mjs build script, no type declarations
import { compileWat } from "../scripts/build-wasm.mjs";
import { SR } from "./helpers.js";

/** Deterministic noise so a failure reproduces. */
function noise(frames: number, seed: number): Float32Array {
  const out = new Float32Array(frames);
  let s = seed >>> 0;
  for (let i = 0; i < frames; i++) {
    s = (s * 1664525 + 1013904223) >>> 0;
    out[i] = (s / 0xffffffff) * 2 - 1;
  }
  return out;
}

const QUANTUM = 128;

/** Runs both kernels over the same input in render-quantum blocks, applying
 * the same knob moves at the same block boundaries. */
function renderBoth(
  input: Float32Array,
  moves: Record<number, (eq: Eq3 | WasmEq3) => void>,
  zeroCopy: boolean,
): { js: Float32Array; wasm: Float32Array } {
  const dsp = WasmDsp.create();
  const jsEq = new Eq3(SR);
  const wasmEq = new WasmEq3(SR, dsp);
  const js = Float32Array.from(input);
  const wasm = Float32Array.from(input);
  const wasmBlock = zeroCopy ? dsp.allocF32(QUANTUM) : null;

  for (let block = 0; block * QUANTUM < input.length; block++) {
    moves[block]?.(jsEq);
    moves[block]?.(wasmEq);
    const start = block * QUANTUM;
    const frames = Math.min(QUANTUM, input.length - start);
    jsEq.process(js.subarray(start, start + frames), frames);
    if (wasmBlock) {
      wasmBlock.set(wasm.subarray(start, start + frames));
      wasmEq.process(wasmBlock, frames);
      wasm.set(wasmBlock.subarray(0, frames), start);
    } else {
      wasmEq.process(wasm.subarray(start, start + frames), frames);
    }
  }
  return { js, wasm };
}

function expectBitIdentical(a: Float32Array, b: Float32Array): void {
  expect(a.length).toBe(b.length);
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) throw new Error(`sample ${i}: js ${a[i]} != wasm ${b[i]}`);
  }
}

describe("WasmEq3", () => {
  it("is bit-identical to the JS Eq3 at unity", () => {
    const { js, wasm } = renderBoth(noise(SR / 4, 1), {}, true);
    expectBitIdentical(js, wasm);
  });

  it("stays bit-identical through knob moves, kills and boosts mid-stream", () => {
    const moves: Record<number, (eq: Eq3 | WasmEq3) => void> = {
      5: (eq) => eq.setLow(0), // bass kill
      20: (eq) => eq.setHigh(1), // full boost
      40: (eq) => eq.setMid(0.2),
      60: (eq) => eq.setLow(0.5), // bring the bass back
      75: (eq) => eq.reset(),
    };
    const { js, wasm } = renderBoth(noise(SR / 2, 7), moves, true);
    expectBitIdentical(js, wasm);
  });

  it("gives the same result through the copy path for off-heap blocks", () => {
    const moves = { 3: (eq: Eq3 | WasmEq3) => eq.setHigh(0) };
    const { js, wasm } = renderBoth(noise(SR / 8, 3), moves, false);
    expectBitIdentical(js, wasm);
  });

  it("keeps separate state per instance", () => {
    const dsp = WasmDsp.create();
    const a = new WasmEq3(SR, dsp);
    const b = new WasmEq3(SR, dsp);
    a.setLow(0);
    expect(a.knobs().low).toBe(0);
    expect(b.knobs().low).toBe(0.5);
    const blockA = dsp.allocF32(QUANTUM);
    const blockB = dsp.allocF32(QUANTUM);
    blockA.set(noise(QUANTUM, 9));
    blockB.set(noise(QUANTUM, 9));
    for (let i = 0; i < 50; i++) {
      a.process(blockA, QUANTUM);
      b.process(blockB, QUANTUM);
    }
    // Same input, different settings: must diverge.
    expect(Array.from(blockA)).not.toEqual(Array.from(blockB));
  });

  it("fails loudly rather than overrunning its memory", () => {
    const dsp = WasmDsp.create();
    expect(() => dsp.allocF32(1 << 20)).toThrow(/out of memory/);
  });

  it("the committed module matches the .wat source", async () => {
    const fresh = (await compileWat("eq3.wat")) as Uint8Array;
    expect(Array.from(EQ3_WASM_BYTES)).toEqual(Array.from(fresh));
  });
});
