/**
 * Pitch-independent tempo control — a BPM knob that does not change pitch.
 *
 * Two-voice granular overlap-add. Each voice tracks its own read cursor,
 * advancing through source content at local rate 1 (so pitch never moves),
 * while the track's actual playhead (`reader.position`) advances separately
 * at the tempo ratio (`reader.rate`) via `advancePlayhead`. Every half-grain
 * a voice's cursor snaps back to the current playhead, so the two voices
 * together track the tempo-adjusted position while each one individually
 * only ever plays source audio forward at its native pitch.
 *
 * Voice B starts a half-grain ahead of voice A so the two Hann windows
 * overlap by exactly 50%. For `hann(x) = 0.5 - 0.5*cos(2*pi*x)` that gives
 * `hann(x) + hann(x + 0.5 mod 1) === 1` for any x — constant overlap-add,
 * so the two voices sum to unity gain with no extra normalisation.
 *
 * Reverse/scratch (negative rate) is out of scope: this path is only used
 * for forward tempo-locked playback. `TrackReader.render` remains available
 * for anything that needs literal-rate (pitch-following) playback.
 */

import type { TrackReader } from "./resampler.js";

function hann(phase01: number): number {
  return 0.5 - 0.5 * Math.cos(2 * Math.PI * phase01);
}

export class TimeStretcher {
  private readonly grainFrames: number;

  private cursorA = 0;
  private cursorB = 0;
  private phaseA = 0;
  private phaseB = 0;

  /** `grainMs` is halved and rounded to an even frame count so the two
   * voices' half-grain offset is an exact integer — required for the
   * constant-overlap-add identity to hold sample-for-sample. */
  constructor(sampleRate: number, grainMs = 80) {
    this.grainFrames = Math.max(2, Math.round((sampleRate * grainMs) / 1000 / 2) * 2);
  }

  /** Re-sync both voices to the reader's current playhead. Call on load,
   * seek, and loop changes to avoid a stale-cursor artifact. */
  reset(reader: TrackReader): void {
    this.cursorA = reader.position;
    this.cursorB = reader.position;
    this.phaseA = 0;
    this.phaseB = this.grainFrames / 2;
  }

  /** Render `frames` tempo-shifted, pitch-locked samples, advancing the
   * reader's playhead by `reader.rate` per output sample. Allocation-free. */
  render(reader: TrackReader, outL: Float32Array, outR: Float32Array, frames: number): void {
    if (!reader.isLoaded) {
      outL.fill(0, 0, frames);
      outR.fill(0, 0, frames);
      return;
    }
    const grain = this.grainFrames;

    for (let i = 0; i < frames; i++) {
      if (reader.atEnd && !reader.loop.active) {
        outL[i] = 0;
        outR[i] = 0;
        continue;
      }

      const wA = hann(this.phaseA / grain);
      const wB = hann(this.phaseB / grain);

      outL[i] = reader.sampleAt(0, this.cursorA) * wA + reader.sampleAt(0, this.cursorB) * wB;
      outR[i] = reader.sampleAt(1, this.cursorA) * wA + reader.sampleAt(1, this.cursorB) * wB;

      this.cursorA += 1;
      this.cursorB += 1;
      this.phaseA += 1;
      this.phaseB += 1;
      reader.advancePlayhead();

      if (this.phaseA >= grain) {
        this.phaseA -= grain;
        this.cursorA = reader.position;
      }
      if (this.phaseB >= grain) {
        this.phaseB -= grain;
        this.cursorB = reader.position;
      }
    }
  }
}
