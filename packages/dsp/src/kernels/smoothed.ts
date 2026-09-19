/**
 * One-pole parameter smoother. Control-rate values (fader positions, knobs)
 * are set from the main thread and must not step discontinuously into the
 * signal path or they produce zipper noise.
 */
export class SmoothedValue {
  private current: number;
  private target: number;
  private coeff: number;

  /**
   * @param timeConstantMs time to reach ~63% of a step change.
   */
  constructor(
    initial: number,
    private readonly sampleRate: number,
    timeConstantMs = 10,
  ) {
    this.current = initial;
    this.target = initial;
    this.coeff = 0;
    this.setTimeConstant(timeConstantMs);
  }

  setTimeConstant(ms: number): void {
    const samples = Math.max((ms / 1000) * this.sampleRate, 1);
    this.coeff = Math.exp(-1 / samples);
  }

  set(value: number): void {
    this.target = value;
  }

  /** Jump immediately — for loads, cue jumps, anything already discontinuous. */
  snap(value: number): void {
    this.target = value;
    this.current = value;
  }

  get value(): number {
    return this.current;
  }

  get isSettled(): boolean {
    return Math.abs(this.current - this.target) < 1e-6;
  }

  next(): number {
    this.current = this.target + (this.current - this.target) * this.coeff;
    // Denormal guard: flush the tail so the CPU never hits subnormal math.
    if (Math.abs(this.current - this.target) < 1e-9) this.current = this.target;
    return this.current;
  }
}
