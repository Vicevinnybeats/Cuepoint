/**
 * Shared state protocol between the audio thread and the main thread.
 *
 * The audio thread writes playhead, meters and loop state once per render
 * quantum. The main thread reads it on requestAnimationFrame. Neither side may
 * block the other, so the handoff is a seqlock: the writer bumps an odd
 * sequence number, writes, then bumps it even. A reader retries until it sees
 * the same even sequence either side of its read, which means it never
 * observes a half-written frame and never makes the audio thread wait.
 *
 * Requires cross-origin isolation for SharedArrayBuffer. Without it the engine
 * falls back to posting these same snapshots over a MessagePort, at the cost of
 * a frame of latency and the structured-clone allocation per post.
 */

/** Float64 slots, indexed into the Float64Array view. */
export const enum F64 {
  /** Playhead in frames, fractional. */
  PlayheadFrames = 0,
  /** Total length of the loaded track in frames. */
  TrackFrames = 1,
  /** Loop in point, frames. */
  LoopStartFrames = 2,
  /** Loop out point, frames. */
  LoopEndFrames = 3,
  /** Effective playback rate, 1 = nominal. */
  Rate = 4,
  /** Detected BPM of the loaded track, scaled by the current rate. */
  EffectiveBpm = 5,
  Count = 6,
}

/** Float32 slots, indexed into the Float32Array view. */
export const enum F32 {
  PeakLeft = 0,
  PeakRight = 1,
  RmsLeft = 2,
  RmsRight = 3,
  /** Limiter gain reduction on the master bus; 1 means idle. */
  GainReduction = 4,
  Count = 5,
}

/** Int32 slots, indexed into the Int32Array view. */
export const enum I32 {
  /** Seqlock counter. Odd while a write is in progress. */
  Sequence = 0,
  Playing = 1,
  LoopActive = 2,
  /** Set while the deck has no track loaded. */
  Empty = 3,
  /** Latched clip indicator. */
  Clipping = 4,
  /** Incremented whenever the track reaches its end. */
  EndedCount = 5,
  Count = 6,
}

const I32_BYTES = I32.Count * 4;
// Float64 reads must be 8-byte aligned, so the Int32 block is padded up.
const I32_BLOCK_BYTES = Math.ceil(I32_BYTES / 8) * 8;
const F64_BYTES = F64.Count * 8;
const F32_BYTES = F32.Count * 4;

export const SHARED_STATE_BYTES = I32_BLOCK_BYTES + F64_BYTES + F32_BYTES;

/** A plain snapshot, safe to hand to React once per animation frame. */
export interface DeckSnapshot {
  playheadFrames: number;
  trackFrames: number;
  loopStartFrames: number;
  loopEndFrames: number;
  rate: number;
  effectiveBpm: number;
  peakLeft: number;
  peakRight: number;
  rmsLeft: number;
  rmsRight: number;
  gainReduction: number;
  playing: boolean;
  loopActive: boolean;
  empty: boolean;
  clipping: boolean;
  endedCount: number;
}

export function createSharedStateBuffer(): SharedArrayBuffer | ArrayBuffer {
  // Falls back to a plain ArrayBuffer when the page is not cross-origin
  // isolated; the views work identically, only the sharing does not.
  const Ctor =
    typeof SharedArrayBuffer === "function" ? SharedArrayBuffer : ArrayBuffer;
  return new Ctor(SHARED_STATE_BYTES);
}

function views(buffer: SharedArrayBuffer | ArrayBuffer): {
  i32: Int32Array;
  f64: Float64Array;
  f32: Float32Array;
} {
  return {
    i32: new Int32Array(buffer, 0, I32.Count),
    f64: new Float64Array(buffer, I32_BLOCK_BYTES, F64.Count),
    f32: new Float32Array(buffer, I32_BLOCK_BYTES + F64_BYTES, F32.Count),
  };
}

/**
 * Audio-thread side. Allocation-free after construction: `beginWrite` and
 * `endWrite` bracket direct writes into the typed-array views.
 */
export class SharedStateWriter {
  readonly i32: Int32Array;
  readonly f64: Float64Array;
  readonly f32: Float32Array;

  constructor(readonly buffer: SharedArrayBuffer | ArrayBuffer) {
    const v = views(buffer);
    this.i32 = v.i32;
    this.f64 = v.f64;
    this.f32 = v.f32;
  }

  /** Mark the frame in progress. Readers retry while the sequence is odd. */
  beginWrite(): void {
    Atomics.add(this.i32, I32.Sequence, 1);
  }

  /** Publish the frame. */
  endWrite(): void {
    Atomics.add(this.i32, I32.Sequence, 1);
  }

  setFlag(slot: I32, value: boolean): void {
    this.i32[slot] = value ? 1 : 0;
  }

  bumpEnded(): void {
    this.i32[I32.EndedCount] = (this.i32[I32.EndedCount] as number) + 1;
  }
}

/**
 * Main-thread side. `read` returns false if the writer was mid-frame for the
 * whole retry budget, in which case the caller keeps last frame's values —
 * at 60 fps against a 128-frame quantum a miss is invisible.
 */
export class SharedStateReader {
  private readonly i32: Int32Array;
  private readonly f64: Float64Array;
  private readonly f32: Float32Array;

  constructor(
    readonly buffer: SharedArrayBuffer | ArrayBuffer,
    private readonly maxRetries = 8,
  ) {
    const v = views(buffer);
    this.i32 = v.i32;
    this.f64 = v.f64;
    this.f32 = v.f32;
  }

  /** Fill `out` in place so the render loop allocates nothing per frame. */
  read(out: DeckSnapshot): boolean {
    for (let attempt = 0; attempt < this.maxRetries; attempt++) {
      const before = Atomics.load(this.i32, I32.Sequence);
      // An odd sequence means a write is in flight; skip straight to a retry.
      if ((before & 1) !== 0) continue;

      const { f64, f32, i32 } = this;
      out.playheadFrames = f64[F64.PlayheadFrames] as number;
      out.trackFrames = f64[F64.TrackFrames] as number;
      out.loopStartFrames = f64[F64.LoopStartFrames] as number;
      out.loopEndFrames = f64[F64.LoopEndFrames] as number;
      out.rate = f64[F64.Rate] as number;
      out.effectiveBpm = f64[F64.EffectiveBpm] as number;
      out.peakLeft = f32[F32.PeakLeft] as number;
      out.peakRight = f32[F32.PeakRight] as number;
      out.rmsLeft = f32[F32.RmsLeft] as number;
      out.rmsRight = f32[F32.RmsRight] as number;
      out.gainReduction = f32[F32.GainReduction] as number;
      out.playing = i32[I32.Playing] === 1;
      out.loopActive = i32[I32.LoopActive] === 1;
      out.empty = i32[I32.Empty] === 1;
      out.clipping = i32[I32.Clipping] === 1;
      out.endedCount = i32[I32.EndedCount] as number;

      if (Atomics.load(this.i32, I32.Sequence) === before) return true;
    }
    return false;
  }
}

export function emptySnapshot(): DeckSnapshot {
  return {
    playheadFrames: 0,
    trackFrames: 0,
    loopStartFrames: 0,
    loopEndFrames: 0,
    rate: 1,
    effectiveBpm: 0,
    peakLeft: 0,
    peakRight: 0,
    rmsLeft: 0,
    rmsRight: 0,
    gainReduction: 1,
    playing: false,
    loopActive: false,
    empty: true,
    clipping: false,
    endedCount: 0,
  };
}
