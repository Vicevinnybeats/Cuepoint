import { describe, it, expect } from "vitest";
import {
  SharedStateWriter,
  SharedStateReader,
  SnapshotPoster,
  applySnapshot,
  isSharedBuffer,
  isStateSnapshot,
  emptySnapshot,
  SHARED_STATE_BYTES,
  F64,
  I32,
} from "../src/shared-state.js";

describe("MessagePort fallback", () => {
  it("recognises a plain ArrayBuffer as not shared", () => {
    expect(isSharedBuffer(new ArrayBuffer(SHARED_STATE_BYTES))).toBe(false);
    expect(isSharedBuffer(new SharedArrayBuffer(SHARED_STATE_BYTES))).toBe(true);
  });

  it("carries a written frame to a separate buffer via a posted snapshot", () => {
    // Two independent buffers, as structured clone produces without
    // cross-origin isolation: the worklet's copy and the main thread's.
    const workletBuffer = new ArrayBuffer(SHARED_STATE_BYTES);
    const mainBuffer = new ArrayBuffer(SHARED_STATE_BYTES);
    const writer = new SharedStateWriter(workletBuffer);

    const posted: unknown[] = [];
    const poster = new SnapshotPoster(workletBuffer, { postMessage: (m) => posted.push(m) }, 1);

    writer.beginWrite();
    writer.f64[F64.PlayheadFrames] = 4242.5;
    writer.setFlag(I32.Playing, true);
    writer.endWrite();
    poster.tick();

    expect(posted).toHaveLength(1);
    const message = posted[0];
    expect(isStateSnapshot(message)).toBe(true);
    if (!isStateSnapshot(message)) return;
    applySnapshot(mainBuffer, message.bytes);

    const out = emptySnapshot();
    expect(new SharedStateReader(mainBuffer).read(out)).toBe(true);
    expect(out.playheadFrames).toBe(4242.5);
    expect(out.playing).toBe(true);
  });

  it("posts a copy, so later writes don't mutate an already-sent snapshot", () => {
    const buffer = new ArrayBuffer(SHARED_STATE_BYTES);
    const writer = new SharedStateWriter(buffer);
    const posted: Array<{ bytes: ArrayBuffer }> = [];
    const poster = new SnapshotPoster(buffer, { postMessage: (m) => posted.push(m as { bytes: ArrayBuffer }) }, 1);

    writer.beginWrite();
    writer.f64[F64.PlayheadFrames] = 1;
    writer.endWrite();
    poster.tick();
    writer.beginWrite();
    writer.f64[F64.PlayheadFrames] = 2;
    writer.endWrite();

    const target = new ArrayBuffer(SHARED_STATE_BYTES);
    applySnapshot(target, posted[0]!.bytes);
    const out = emptySnapshot();
    new SharedStateReader(target).read(out);
    expect(out.playheadFrames).toBe(1);
  });

  it("throttles to one post per N quanta", () => {
    const buffer = new ArrayBuffer(SHARED_STATE_BYTES);
    let count = 0;
    const poster = new SnapshotPoster(buffer, { postMessage: () => count++ }, 6);
    for (let i = 0; i < 60; i++) poster.tick();
    expect(count).toBe(10);
  });

  it("ignores unrelated port messages", () => {
    expect(isStateSnapshot({ type: "play" })).toBe(false);
    expect(isStateSnapshot(null)).toBe(false);
    expect(isStateSnapshot({ type: "state", bytes: "nope" })).toBe(false);
  });
});
