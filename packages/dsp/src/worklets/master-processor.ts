/**
 * Master bus for a 4-channel mixer. Sums the deck channels through the
 * crossfader, applies master gain, then limits so the output device never
 * receives a sample past full scale.
 *
 * Input N is deck N (0=A, 1=B, 2=C, 3=D — the order EngineClient connects
 * them in). Each channel is assigned to the crossfader's A side, its B
 * side, or "thru" (bypasses the crossfader, always full gain) — the
 * "crossfader assign" switch every mixer with more than 2 channels needs,
 * since one crossfader only blends two sides. Allocation-free inside
 * `process`.
 */

import { crossfaderGains, assignedCrossfaderGain } from "../kernels/crossfader.js";
import type { CrossfaderCurve, CrossfaderGains, CrossfaderAssign } from "../kernels/crossfader.js";
import { Limiter } from "../kernels/limiter.js";
import { Meter } from "../kernels/meter.js";
import { SmoothedValue } from "../kernels/smoothed.js";
import { SharedStateWriter, SnapshotPoster, isSharedBuffer, F32, I32 } from "../shared-state.js";
import type { MasterMessage } from "../protocol.js";

const CHANNEL_COUNT = 4;
/** Sensible default: the first two channels are the traditional two-deck
 * crossfader sides; the extra channels stay thru until assigned. */
const DEFAULT_ASSIGNS: CrossfaderAssign[] = ["A", "B", "thru", "thru"];

class MasterProcessor extends AudioWorkletProcessor {
  private readonly limiter: Limiter;
  private readonly meterL: Meter;
  private readonly meterR: Meter;
  private readonly masterGain: SmoothedValue;
  // The crossfader is smoothed per channel rather than applied per message,
  // so a fast cut stays click-free without quantising to the message rate.
  private readonly channelFade: SmoothedValue[];
  private readonly assigns: CrossfaderAssign[] = [...DEFAULT_ASSIGNS];

  // Reused across every quantum so the crossfader math allocates nothing.
  private readonly gains: CrossfaderGains = { a: 1, b: 1 };
  private curve: CrossfaderCurve = "constant-power";
  private position = 0;

  private readonly shared: SharedStateWriter | null;
  /** Set only when the state buffer isn't truly shared (no COOP/COEP). */
  private readonly poster: SnapshotPoster | null;

  constructor(options?: AudioWorkletNodeOptions) {
    super(options);
    const data = options?.processorOptions as { sharedState?: SharedArrayBuffer | ArrayBuffer };

    this.limiter = new Limiter(sampleRate);
    this.meterL = new Meter(sampleRate);
    this.meterR = new Meter(sampleRate);
    this.masterGain = new SmoothedValue(1, sampleRate, 15);
    this.channelFade = Array.from({ length: CHANNEL_COUNT }, () => new SmoothedValue(1, sampleRate, 6));

    this.shared = data?.sharedState ? new SharedStateWriter(data.sharedState) : null;
    this.poster =
      data?.sharedState && !isSharedBuffer(data.sharedState)
        ? new SnapshotPoster(data.sharedState, this.port)
        : null;
    this.applyCrossfader();

    this.port.onmessage = (event: MessageEvent<MasterMessage>) => {
      const message = event.data;
      switch (message.type) {
        case "crossfader":
          this.position = message.position;
          this.applyCrossfader();
          break;
        case "crossfaderCurve":
          this.curve = message.curve;
          this.applyCrossfader();
          break;
        case "masterGain":
          this.masterGain.set(message.value);
          break;
        case "crossfaderAssign":
          if (message.channel >= 0 && message.channel < CHANNEL_COUNT) {
            this.assigns[message.channel] = message.assign;
            this.applyCrossfader();
          }
          break;
      }
    };
  }

  private applyCrossfader(): void {
    crossfaderGains(this.position, this.curve, this.gains);
    for (let i = 0; i < CHANNEL_COUNT; i++) {
      this.channelFade[i]?.set(assignedCrossfaderGain(this.assigns[i] ?? "thru", this.gains));
    }
  }

  process(inputs: Float32Array[][], outputs: Float32Array[][]): boolean {
    const output = outputs[0];
    const outL = output?.[0];
    const outR = output?.[1];
    if (!outL || !outR) return true;

    const frames = outL.length;
    // A disconnected input arrives as an empty array, not a silent buffer.
    const chL: Array<Float32Array | undefined> = [];
    const chR: Array<Float32Array | undefined> = [];
    for (let i = 0; i < CHANNEL_COUNT; i++) {
      const input = inputs[i];
      chL.push(input?.[0]);
      chR.push(input?.[1] ?? input?.[0]);
    }

    for (let i = 0; i < frames; i++) {
      const gm = this.masterGain.next();
      let l = 0;
      let r = 0;
      for (let c = 0; c < CHANNEL_COUNT; c++) {
        const g = this.channelFade[c]?.next() ?? 1;
        l += (chL[c]?.[i] ?? 0) * g;
        r += (chR[c]?.[i] ?? 0) * g;
      }
      outL[i] = l * gm;
      outR[i] = r * gm;
    }

    this.limiter.process(outL, outR, frames);
    this.meterL.process(outL, frames);
    this.meterR.process(outR, frames);

    const shared = this.shared;
    if (shared) {
      shared.beginWrite();
      shared.f32[F32.PeakLeft] = this.meterL.peak;
      shared.f32[F32.PeakRight] = this.meterR.peak;
      shared.f32[F32.RmsLeft] = this.meterL.rms;
      shared.f32[F32.RmsRight] = this.meterR.rms;
      shared.f32[F32.GainReduction] = this.limiter.reduction;
      shared.setFlag(I32.Clipping, this.meterL.isClipping || this.meterR.isClipping);
      shared.endWrite();
    }
    this.poster?.tick();
    return true;
  }
}

registerProcessor("master-processor", MasterProcessor);
