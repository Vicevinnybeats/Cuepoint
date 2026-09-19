/**
 * Peak/RMS meter with the ballistics a DJ mixer uses: instant attack, slow
 * decay on peak, and a windowed RMS for the body of the signal.
 *
 * Allocation-free: the RMS window is a fixed ring buffer sized at construction.
 */
export class Meter {
  private peakValue = 0;
  private readonly decayPerSample: number;

  private readonly window: Float32Array;
  private windowIndex = 0;
  private windowSum = 0;

  private clipHoldRemaining = 0;
  private readonly clipHoldSamples: number;

  constructor(
    readonly sampleRate: number,
    rmsWindowMs = 300,
    peakDecayDbPerSecond = 20,
    clipHoldMs = 1200,
  ) {
    const windowSize = Math.max(1, Math.round((rmsWindowMs / 1000) * sampleRate));
    this.window = new Float32Array(windowSize);
    this.decayPerSample = Math.pow(10, -peakDecayDbPerSecond / 20 / sampleRate);
    this.clipHoldSamples = Math.round((clipHoldMs / 1000) * sampleRate);
  }

  reset(): void {
    this.peakValue = 0;
    this.window.fill(0);
    this.windowIndex = 0;
    this.windowSum = 0;
    this.clipHoldRemaining = 0;
  }

  /** Feed a block. Does not modify it. */
  process(block: Float32Array, frames: number): void {
    let peak = this.peakValue;
    const decay = this.decayPerSample;
    const win = this.window;
    const size = win.length;
    let idx = this.windowIndex;
    let sum = this.windowSum;

    for (let i = 0; i < frames; i++) {
      const x = block[i] as number;
      const a = x < 0 ? -x : x;

      peak = a > peak ? a : peak * decay;
      if (a >= 1) this.clipHoldRemaining = this.clipHoldSamples;

      const sq = x * x;
      sum += sq - (win[idx] as number);
      win[idx] = sq;
      idx = idx + 1 === size ? 0 : idx + 1;
    }

    if (this.clipHoldRemaining > 0) {
      this.clipHoldRemaining = Math.max(0, this.clipHoldRemaining - frames);
    }

    this.peakValue = peak;
    this.windowIndex = idx;
    // Float error accumulates over a long-running sliding sum; clamp at zero.
    this.windowSum = sum > 0 ? sum : 0;
  }

  get peak(): number {
    return this.peakValue;
  }

  get rms(): number {
    return Math.sqrt(this.windowSum / this.window.length);
  }

  get isClipping(): boolean {
    return this.clipHoldRemaining > 0;
  }
}

export function linearToDb(linear: number): number {
  return linear <= 1e-7 ? -Infinity : 20 * Math.log10(linear);
}

export function dbToLinear(db: number): number {
  return Math.pow(10, db / 20);
}
