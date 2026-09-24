/**
 * Interpolating track reader — the core of deck playback.
 *
 * Holds a fractional playhead in frames and advances it by `rate` per output
 * sample, so tempo changes, pitch bend, nudge, reverse and scratch all fall
 * out of one mechanism. Interpolation is Catmull-Rom (4-point cubic): audibly
 * clean over the +-8% range a tempo fader covers, and cheap enough to run per
 * sample on a phone.
 *
 * Loops wrap sample-accurately, and the interpolation neighbours wrap with
 * them, so a loop seam is continuous rather than momentarily reading silence
 * past the loop end.
 */

export interface LoopRegion {
  /** Loop in point, in frames. */
  start: number;
  /** Loop out point, in frames, exclusive. */
  end: number;
  active: boolean;
}

/** Catmull-Rom at fractional offset `t` in [0,1) between y1 and y2. */
export function catmullRom(
  y0: number,
  y1: number,
  y2: number,
  y3: number,
  t: number,
): number {
  const a = -0.5 * y0 + 1.5 * y1 - 1.5 * y2 + 0.5 * y3;
  const b = y0 - 2.5 * y1 + 2 * y2 - 0.5 * y3;
  const c = -0.5 * y0 + 0.5 * y2;
  return ((a * t + b) * t + c) * t + y1;
}

export class TrackReader {
  /** Fractional playhead in frames. */
  position = 0;
  /** Playback rate; 1 is nominal, negative plays backwards. */
  rate = 1;

  readonly loop: LoopRegion = { start: 0, end: 0, active: false };

  private channels: Float32Array[] = [];
  private lengthFrames = 0;
  /** Set once the playhead runs off the end of the track. */
  private ended = false;

  get isLoaded(): boolean {
    return this.lengthFrames > 0;
  }

  get frames(): number {
    return this.lengthFrames;
  }

  get channelCount(): number {
    return this.channels.length;
  }

  get atEnd(): boolean {
    return this.ended;
  }

  /**
   * Point the reader at decoded audio. The arrays are adopted, not copied:
   * they are expected to be views onto memory the worklet already owns.
   */
  load(channels: Float32Array[]): void {
    this.channels = channels;
    this.lengthFrames = channels[0]?.length ?? 0;
    this.position = 0;
    this.ended = false;
    this.loop.active = false;
    this.loop.start = 0;
    this.loop.end = 0;
  }

  unload(): void {
    this.channels = [];
    this.lengthFrames = 0;
    this.position = 0;
    this.ended = true;
  }

  seek(frame: number): void {
    this.position = Math.min(Math.max(frame, 0), Math.max(this.lengthFrames - 1, 0));
    this.ended = false;
  }

  setLoop(start: number, end: number): void {
    // A loop shorter than the interpolation kernel cannot be read coherently.
    if (!(end > start + 4)) {
      this.loop.active = false;
      return;
    }
    this.loop.start = start;
    this.loop.end = end;
    this.loop.active = true;
  }

  clearLoop(): void {
    this.loop.active = false;
  }

  /**
   * Read one interpolated sample from `channel` at fractional frame `pos`,
   * wrapping the interpolation neighbourhood through the loop when one is set.
   */
  private interpolateChannel(channel: Float32Array, pos: number): number {
    const i1 = Math.floor(pos);
    const t = pos - i1;
    return catmullRom(
      channel[this.neighbour(i1 - 1)] ?? 0,
      channel[this.neighbour(i1)] ?? 0,
      channel[this.neighbour(i1 + 1)] ?? 0,
      channel[this.neighbour(i1 + 2)] ?? 0,
      t,
    );
  }

  /**
   * Public, position-independent read: interpolated sample from
   * `channelIndex` at fractional frame `pos`, without touching the deck's
   * own playhead. Mono tracks feed every channel index, matching `render`.
   * Used by TimeStretcher, which tracks its own read cursor per grain
   * while the playhead advances separately (at the tempo ratio).
   */
  sampleAt(channelIndex: number, pos: number): number {
    const channel = this.channels[channelIndex] ?? this.channels[0];
    if (!channel) return 0;
    return this.interpolateChannel(channel, pos);
  }

  /** Bookkeeping-only playhead advance (loop wrap, end detection) with no
   * sample read — for callers (TimeStretcher) that read samples through
   * `sampleAt` at their own cursor instead of through `render`. */
  advancePlayhead(): void {
    this.advance();
  }

  /** Clamp to the track, or wrap within the loop when one is active. */
  private neighbour(index: number): number {
    const loop = this.loop;
    if (loop.active) {
      const span = loop.end - loop.start;
      if (index < loop.start) return loop.end - ((loop.start - index) % span);
      if (index >= loop.end) return loop.start + ((index - loop.start) % span);
      return index;
    }
    if (index < 0) return 0;
    if (index >= this.lengthFrames) return this.lengthFrames - 1;
    return index;
  }

  /** Advance the playhead one output sample, applying loop wrap. */
  private advance(): void {
    const loop = this.loop;
    this.position += this.rate;

    if (loop.active) {
      const span = loop.end - loop.start;
      if (this.position >= loop.end) {
        this.position = loop.start + ((this.position - loop.start) % span);
      } else if (this.position < loop.start) {
        // Reverse playback through the loop in point wraps to the out point.
        this.position = loop.end - ((loop.start - this.position) % span);
      }
      return;
    }

    if (this.position >= this.lengthFrames) {
      this.position = this.lengthFrames;
      this.ended = true;
    } else if (this.position < 0) {
      this.position = 0;
      this.ended = true;
    }
  }

  /**
   * Render `frames` samples into `outL`/`outR`. Allocation-free.
   * Writes silence past the end of the track rather than stopping short, so
   * the caller's block length is always honoured.
   */
  render(outL: Float32Array, outR: Float32Array, frames: number): void {
    const left = this.channels[0];
    if (!left || this.lengthFrames === 0) {
      outL.fill(0, 0, frames);
      outR.fill(0, 0, frames);
      return;
    }
    // Mono tracks feed both sides, as every DJ app does on load.
    const right = this.channels[1] ?? left;

    for (let i = 0; i < frames; i++) {
      if (this.ended && !this.loop.active) {
        outL[i] = 0;
        outR[i] = 0;
        continue;
      }
      const pos = this.position;
      outL[i] = this.interpolateChannel(left, pos);
      outR[i] = this.interpolateChannel(right, pos);
      this.advance();
    }
  }
}
