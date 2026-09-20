import { describe, it, expect } from "vitest";
import {
  SharedStateWriter,
  SharedStateReader,
  createSharedStateBuffer,
  emptySnapshot,
  SHARED_STATE_BYTES,
  F64,
  F32,
  I32,
} from "../src/shared-state.js";

describe("shared state", () => {
  it("allocates a buffer with room for every slot", () => {
    expect(SHARED_STATE_BYTES).toBeGreaterThanOrEqual(
      I32.Count * 4 + F64.Count * 8 + F32.Count * 4,
    );
    expect(createSharedStateBuffer().byteLength).toBe(SHARED_STATE_BYTES);
  });

  it("aligns the Float64 block so reads do not throw", () => {
    // Float64Array requires an 8-byte aligned offset; an unpadded Int32 block
    // of an odd count would put it on a 4-byte boundary.
    expect(() => new SharedStateWriter(createSharedStateBuffer())).not.toThrow();
  });

  it("round-trips a full frame", () => {
    const buffer = createSharedStateBuffer();
    const w = new SharedStateWriter(buffer);
    const r = new SharedStateReader(buffer);

    w.beginWrite();
    w.f64[F64.PlayheadFrames] = 123456.75;
    w.f64[F64.TrackFrames] = 8_000_000;
    w.f64[F64.LoopStartFrames] = 1000;
    w.f64[F64.LoopEndFrames] = 2000;
    w.f64[F64.Rate] = 1.04;
    w.f64[F64.EffectiveBpm] = 128.5;
    w.f32[F32.PeakLeft] = 0.5;
    w.f32[F32.GainReduction] = 0.8;
    w.setFlag(I32.Playing, true);
    w.setFlag(I32.LoopActive, true);
    w.setFlag(I32.Empty, false);
    w.endWrite();

    const out = emptySnapshot();
    expect(r.read(out)).toBe(true);
    expect(out.playheadFrames).toBe(123456.75);
    expect(out.trackFrames).toBe(8_000_000);
    expect(out.loopStartFrames).toBe(1000);
    expect(out.loopEndFrames).toBe(2000);
    expect(out.rate).toBeCloseTo(1.04, 10);
    expect(out.effectiveBpm).toBe(128.5);
    expect(out.peakLeft).toBe(0.5);
    expect(out.gainReduction).toBeCloseTo(0.8, 6);
    expect(out.playing).toBe(true);
    expect(out.loopActive).toBe(true);
    expect(out.empty).toBe(false);
  });

  it("preserves sub-sample playhead precision over a long track", () => {
    const buffer = createSharedStateBuffer();
    const w = new SharedStateWriter(buffer);
    const r = new SharedStateReader(buffer);
    // Two hours at 48 kHz. Float32 would quantise this to ~32-frame steps,
    // which is why the playhead is Float64.
    const playhead = 345_600_000.25;
    w.beginWrite();
    w.f64[F64.PlayheadFrames] = playhead;
    w.endWrite();
    const out = emptySnapshot();
    r.read(out);
    expect(out.playheadFrames).toBe(playhead);
  });

  it("refuses to read a frame that is mid-write", () => {
    const buffer = createSharedStateBuffer();
    const w = new SharedStateWriter(buffer);
    const r = new SharedStateReader(buffer, 4);
    w.beginWrite();
    w.f64[F64.PlayheadFrames] = 42;
    // No endWrite: the sequence is odd, so the reader must decline.
    const out = emptySnapshot();
    expect(r.read(out)).toBe(false);
    expect(out.playheadFrames).toBe(0);
  });

  it("recovers once the writer completes its frame", () => {
    const buffer = createSharedStateBuffer();
    const w = new SharedStateWriter(buffer);
    const r = new SharedStateReader(buffer, 4);
    const out = emptySnapshot();

    w.beginWrite();
    expect(r.read(out)).toBe(false);
    w.f64[F64.PlayheadFrames] = 99;
    w.endWrite();
    expect(r.read(out)).toBe(true);
    expect(out.playheadFrames).toBe(99);
  });

  it("leaves the previous snapshot intact when a read is declined", () => {
    const buffer = createSharedStateBuffer();
    const w = new SharedStateWriter(buffer);
    const r = new SharedStateReader(buffer, 2);
    const out = emptySnapshot();

    w.beginWrite();
    w.f64[F64.PlayheadFrames] = 500;
    w.endWrite();
    r.read(out);

    w.beginWrite();
    w.f64[F64.PlayheadFrames] = 501;
    expect(r.read(out)).toBe(false);
    // The UI keeps drawing last frame rather than a torn one.
    expect(out.playheadFrames).toBe(500);
  });

  it("counts track endings so the UI can react without polling a flag", () => {
    const buffer = createSharedStateBuffer();
    const w = new SharedStateWriter(buffer);
    const r = new SharedStateReader(buffer);
    const out = emptySnapshot();

    w.beginWrite();
    w.bumpEnded();
    w.bumpEnded();
    w.endWrite();
    r.read(out);
    expect(out.endedCount).toBe(2);
  });

  it("shares one buffer between independent writer and reader views", () => {
    const buffer = createSharedStateBuffer();
    const w = new SharedStateWriter(buffer);
    // A second reader, as a worklet-side and UI-side pair would be.
    const r1 = new SharedStateReader(buffer);
    const r2 = new SharedStateReader(buffer);
    w.beginWrite();
    w.f64[F64.Rate] = 0.92;
    w.endWrite();
    const a = emptySnapshot();
    const b = emptySnapshot();
    r1.read(a);
    r2.read(b);
    expect(a.rate).toBeCloseTo(0.92, 10);
    expect(b.rate).toBeCloseTo(0.92, 10);
  });
});
