/**
 * Deck voice. One per deck, running on the audio thread.
 *
 * Chain: track reader -> trim -> EQ -> filter -> channel fader -> output.
 * Metering is taken post-fader, which is where a mixer's channel meter sits.
 *
 * Nothing inside `process` allocates, logs, awaits or locks. Every buffer and
 * every kernel is built in the constructor; control changes arrive as messages
 * and are applied by mutating already-allocated state.
 */

import { TrackReader } from "../kernels/resampler.js";
import { Eq3 } from "../kernels/eq3.js";
import { FilterKnob } from "../kernels/filter-knob.js";
import { Meter } from "../kernels/meter.js";
import { SmoothedValue } from "../kernels/smoothed.js";
import { SharedStateWriter, F64, F32, I32 } from "../shared-state.js";
import type { DeckMessage } from "../protocol.js";

/** Largest render quantum we pre-allocate scratch for. */
const MAX_QUANTUM = 1024;

class DeckProcessor extends AudioWorkletProcessor {
  private readonly reader = new TrackReader();
  private readonly eq: Eq3;
  private readonly filter: FilterKnob;
  private readonly meter: Meter;

  private readonly trim: SmoothedValue;
  private readonly fader: SmoothedValue;
  private readonly cueMute: SmoothedValue;

  // Scratch for the left/right render before it is written to the outputs.
  private readonly scratchL = new Float32Array(MAX_QUANTUM);
  private readonly scratchR = new Float32Array(MAX_QUANTUM);

  private readonly shared: SharedStateWriter | null;
  private playing = false;
  private bpm = 0;
  private lastEnded = false;

  constructor(options?: AudioWorkletNodeOptions) {
    super(options);
    const data = options?.processorOptions as { sharedState?: SharedArrayBuffer };

    this.eq = new Eq3(sampleRate);
    this.filter = new FilterKnob(sampleRate);
    this.meter = new Meter(sampleRate);
    this.trim = new SmoothedValue(1, sampleRate, 15);
    this.fader = new SmoothedValue(1, sampleRate, 15);
    // A cue cut is a mute button, not a fade: short enough to feel instant,
    // long enough not to click.
    this.cueMute = new SmoothedValue(1, sampleRate, 3);

    this.shared = data?.sharedState ? new SharedStateWriter(data.sharedState) : null;
    if (this.shared) this.shared.setFlag(I32.Empty, true);

    this.port.onmessage = (event: MessageEvent<DeckMessage>) => {
      this.handle(event.data);
    };
  }

  /** Control-rate. Runs on the audio thread but outside `process`. */
  private handle(message: DeckMessage): void {
    switch (message.type) {
      case "load": {
        const channels = message.channels.map((b) => new Float32Array(b));
        this.reader.load(channels);
        this.bpm = message.bpm;
        this.playing = false;
        this.eq.reset();
        this.filter.reset();
        this.meter.reset();
        break;
      }
      case "unload":
        this.reader.unload();
        this.playing = false;
        this.bpm = 0;
        break;
      case "play":
        // Playing past the end does nothing until the deck is cued back.
        if (this.reader.isLoaded && !this.reader.atEnd) this.playing = true;
        break;
      case "pause":
        this.playing = false;
        break;
      case "seek":
        this.reader.seek(message.frame);
        break;
      case "rate":
        this.reader.rate = message.value;
        break;
      case "loop":
        this.reader.setLoop(message.start, message.end);
        break;
      case "clearLoop":
        this.reader.clearLoop();
        break;
      case "eq":
        this.eq.setLow(message.low);
        this.eq.setMid(message.mid);
        this.eq.setHigh(message.high);
        break;
      case "filter":
        this.filter.set(message.value);
        break;
      case "gain":
        this.trim.set(message.value);
        break;
      case "fader":
        this.fader.set(message.value);
        break;
      case "cue":
        this.cueMute.set(message.enabled ? 0 : 1);
        break;
    }
  }

  process(_inputs: Float32Array[][], outputs: Float32Array[][]): boolean {
    const output = outputs[0];
    const outL = output?.[0];
    const outR = output?.[1];
    if (!outL || !outR) return true;

    const frames = Math.min(outL.length, MAX_QUANTUM);
    const { scratchL, scratchR } = this;

    if (this.playing && this.reader.isLoaded) {
      this.reader.render(scratchL, scratchR, frames);
    } else {
      scratchL.fill(0, 0, frames);
      scratchR.fill(0, 0, frames);
    }

    this.eq.process(scratchL, frames);
    this.eq.process(scratchR, frames);
    this.filter.process(scratchL, frames);
    this.filter.process(scratchR, frames);

    for (let i = 0; i < frames; i++) {
      const g = this.trim.next() * this.fader.next() * this.cueMute.next();
      const l = (scratchL[i] as number) * g;
      const r = (scratchR[i] as number) * g;
      scratchL[i] = l;
      scratchR[i] = r;
      outL[i] = l;
      outR[i] = r;
    }

    this.meter.process(scratchL, frames);
    this.publish();
    return true;
  }

  private publish(): void {
    const shared = this.shared;
    if (!shared) return;

    const reader = this.reader;
    shared.beginWrite();
    shared.f64[F64.PlayheadFrames] = reader.position;
    shared.f64[F64.TrackFrames] = reader.frames;
    shared.f64[F64.LoopStartFrames] = reader.loop.start;
    shared.f64[F64.LoopEndFrames] = reader.loop.end;
    shared.f64[F64.Rate] = reader.rate;
    shared.f64[F64.EffectiveBpm] = this.bpm * reader.rate;
    shared.f32[F32.PeakLeft] = this.meter.peak;
    shared.f32[F32.PeakRight] = this.meter.peak;
    shared.f32[F32.RmsLeft] = this.meter.rms;
    shared.f32[F32.RmsRight] = this.meter.rms;
    shared.setFlag(I32.Playing, this.playing);
    shared.setFlag(I32.LoopActive, reader.loop.active);
    shared.setFlag(I32.Empty, !reader.isLoaded);
    shared.setFlag(I32.Clipping, this.meter.isClipping);
    // Edge-triggered: the UI sees a counter tick once per end, not a level.
    if (reader.atEnd && !this.lastEnded) shared.bumpEnded();
    this.lastEnded = reader.atEnd;
    shared.endWrite();
  }
}

registerProcessor("deck-processor", DeckProcessor);
