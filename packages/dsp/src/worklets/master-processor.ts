/**
 * Master bus. Sums the deck channels through the crossfader, applies master
 * gain, then limits so the output device never receives a sample past full
 * scale.
 *
 * Input 0 is deck A, input 1 is deck B. Allocation-free inside `process`.
 */

import { crossfaderGains } from "../kernels/crossfader.js";
import type { CrossfaderCurve, CrossfaderGains } from "../kernels/crossfader.js";
import { Limiter } from "../kernels/limiter.js";
import { Meter } from "../kernels/meter.js";
import { SmoothedValue } from "../kernels/smoothed.js";
import { SharedStateWriter, SnapshotPoster, isSharedBuffer, F32, I32 } from "../shared-state.js";
import type { MasterMessage } from "../protocol.js";

class MasterProcessor extends AudioWorkletProcessor {
  private readonly limiter: Limiter;
  private readonly meterL: Meter;
  private readonly meterR: Meter;
  private readonly masterGain: SmoothedValue;
  private readonly fadeA: SmoothedValue;
  private readonly fadeB: SmoothedValue;

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
    // The crossfader is smoothed rather than applied per message so a fast
    // cut stays click-free without quantising to the message rate.
    this.fadeA = new SmoothedValue(1, sampleRate, 6);
    this.fadeB = new SmoothedValue(1, sampleRate, 6);

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
      }
    };
  }

  private applyCrossfader(): void {
    crossfaderGains(this.position, this.curve, this.gains);
    this.fadeA.set(this.gains.a);
    this.fadeB.set(this.gains.b);
  }

  process(inputs: Float32Array[][], outputs: Float32Array[][]): boolean {
    const output = outputs[0];
    const outL = output?.[0];
    const outR = output?.[1];
    if (!outL || !outR) return true;

    const frames = outL.length;
    const a = inputs[0];
    const b = inputs[1];
    // A disconnected input arrives as an empty array, not a silent buffer.
    const aL = a?.[0];
    const aR = a?.[1] ?? aL;
    const bL = b?.[0];
    const bR = b?.[1] ?? bL;

    for (let i = 0; i < frames; i++) {
      const ga = this.fadeA.next();
      const gb = this.fadeB.next();
      const gm = this.masterGain.next();
      outL[i] = ((aL?.[i] ?? 0) * ga + (bL?.[i] ?? 0) * gb) * gm;
      outR[i] = ((aR?.[i] ?? 0) * ga + (bR?.[i] ?? 0) * gb) * gm;
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
