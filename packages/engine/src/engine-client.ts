/**
 * Browser-side facade over the audio graph. Owns the AudioContext, the deck
 * and master AudioWorkletNodes, and the shared-memory buffers each publishes
 * into. UI code talks to this, never to the worklets directly.
 *
 * This class touches real browser APIs (AudioContext, AudioWorkletNode) and
 * is not unit-tested here; packages/dsp covers the DSP it drives, and
 * apps/web's Vitest/Playwright suite is the place for graph-level coverage
 * once the worklet bundle step exists (see README "Stubbed").
 */

import {
  createSharedStateBuffer,
  SharedStateReader,
  applySnapshot,
  isSharedBuffer,
  isStateSnapshot,
} from "@cuepoint/dsp/shared";
import type { DeckMessage, MasterMessage } from "@cuepoint/dsp";
import type { CrossfaderCurve, CrossfaderAssign } from "@cuepoint/dsp/kernels";
import { DECK_IDS } from "./types.js";
import type { DeckId } from "./types.js";

export interface EngineClientOptions {
  /** URL to the bundled deck-processor worklet module. */
  deckWorkletUrl: string;
  /** URL to the bundled master-processor worklet module. */
  masterWorkletUrl: string;
}

export class EngineClient {
  private constructor(
    private readonly ctx: AudioContext,
    private readonly deckNodes: Record<DeckId, AudioWorkletNode>,
    private readonly masterNode: AudioWorkletNode,
    private readonly readers: Record<DeckId | "master", SharedStateReader>,
  ) {}

  static async create(options: EngineClientOptions): Promise<EngineClient> {
    const ctx = new AudioContext({ latencyHint: "interactive" });
    await ctx.audioWorklet.addModule(options.deckWorkletUrl);
    await ctx.audioWorklet.addModule(options.masterWorkletUrl);

    const masterBuffer = createSharedStateBuffer();
    const master = new AudioWorkletNode(ctx, "master-processor", {
      numberOfInputs: DECK_IDS.length,
      numberOfOutputs: 1,
      outputChannelCount: [2],
      processorOptions: { sharedState: masterBuffer },
    });

    // Without cross-origin isolation the buffers below are plain
    // ArrayBuffers: each worklet writes into its own copy, and posts that
    // copy back over its port instead (see SnapshotPoster). Mirror it here
    // so the readers — and everything drawing from them — work unchanged.
    const mirror = (node: AudioWorkletNode, buffer: SharedArrayBuffer | ArrayBuffer): void => {
      if (isSharedBuffer(buffer)) return;
      node.port.onmessage = (event: MessageEvent<unknown>) => {
        if (isStateSnapshot(event.data)) applySnapshot(buffer, event.data.bytes);
      };
    };
    mirror(master, masterBuffer);

    const deckNodes = {} as Record<DeckId, AudioWorkletNode>;
    const readers = { master: new SharedStateReader(masterBuffer) } as Record<
      DeckId | "master",
      SharedStateReader
    >;

    DECK_IDS.forEach((id, inputIndex) => {
      const buffer = createSharedStateBuffer();
      const node = new AudioWorkletNode(ctx, "deck-processor", {
        numberOfInputs: 0,
        numberOfOutputs: 1,
        outputChannelCount: [2],
        processorOptions: { sharedState: buffer },
      });
      mirror(node, buffer);
      node.connect(master, 0, inputIndex);
      deckNodes[id] = node;
      readers[id] = new SharedStateReader(buffer);
    });

    master.connect(ctx.destination);

    return new EngineClient(ctx, deckNodes, master, readers);
  }

  /** Whether playhead/meter state travels through SharedArrayBuffer (true)
   * or the MessagePort fallback (false, a frame or so behind). */
  /** The AudioContext's actual rate. decodeAudioData resamples every track
   * to it, so playhead/loop frames convert to seconds with this — not an
   * assumed 48 kHz (many phones run at 44.1 kHz). */
  get sampleRate(): number {
    return this.ctx.sampleRate;
  }

  get crossOriginIsolated(): boolean {
    return typeof globalThis.crossOriginIsolated === "boolean" && globalThis.crossOriginIsolated;
  }

  /** Autoplay policies require this to run from a user gesture. */
  async resume(): Promise<void> {
    if (this.ctx.state === "suspended") await this.ctx.resume();
  }

  reader(target: DeckId | "master"): SharedStateReader {
    return this.readers[target];
  }

  /** Decode without loading — callers that also need the raw samples for
   * BPM/waveform analysis decode once and pass the result to
   * `loadDecodedTrack` rather than decoding twice. */
  async decode(data: ArrayBuffer): Promise<AudioBuffer> {
    // decodeAudioData can detach the buffer it's given, so hand it a copy.
    return this.ctx.decodeAudioData(data.slice(0));
  }

  loadDecodedTrack(deck: DeckId, decoded: AudioBuffer, bpm: number): void {
    const channels: ArrayBuffer[] = [];
    for (let i = 0; i < decoded.numberOfChannels; i++) {
      channels.push(decoded.getChannelData(i).slice().buffer);
    }
    const message: DeckMessage = {
      type: "load",
      channels,
      frames: decoded.length,
      sampleRate: decoded.sampleRate,
      bpm,
    };
    // The worklet takes ownership of these buffers via transfer.
    this.deckNodes[deck].port.postMessage(message, channels);
  }

  async loadTrack(deck: DeckId, data: ArrayBuffer, bpm: number): Promise<void> {
    const decoded = await this.decode(data);
    this.loadDecodedTrack(deck, decoded, bpm);
  }

  send(deck: DeckId, message: DeckMessage): void {
    this.deckNodes[deck].port.postMessage(message);
  }

  sendMaster(message: MasterMessage): void {
    this.masterNode.port.postMessage(message);
  }

  play(deck: DeckId): void {
    this.send(deck, { type: "play" });
  }
  pause(deck: DeckId): void {
    this.send(deck, { type: "pause" });
  }
  seek(deck: DeckId, frame: number): void {
    this.send(deck, { type: "seek", frame });
  }
  setRate(deck: DeckId, value: number): void {
    this.send(deck, { type: "rate", value });
  }
  setEq(deck: DeckId, low: number, mid: number, high: number): void {
    this.send(deck, { type: "eq", low, mid, high });
  }
  setFilter(deck: DeckId, value: number): void {
    this.send(deck, { type: "filter", value });
  }
  setGain(deck: DeckId, value: number): void {
    this.send(deck, { type: "gain", value });
  }
  setFader(deck: DeckId, value: number): void {
    this.send(deck, { type: "fader", value });
  }
  setCue(deck: DeckId, enabled: boolean): void {
    this.send(deck, { type: "cue", enabled });
  }
  setLoop(deck: DeckId, start: number, end: number): void {
    this.send(deck, { type: "loop", start, end });
  }
  clearLoop(deck: DeckId): void {
    this.send(deck, { type: "clearLoop" });
  }

  setCrossfader(position: number): void {
    this.sendMaster({ type: "crossfader", position });
  }
  setCrossfaderCurve(curve: CrossfaderCurve): void {
    this.sendMaster({ type: "crossfaderCurve", curve });
  }
  /** Which crossfader side (or "thru" to bypass it) `deck` responds to —
   * the assign switch a mixer with more than 2 channels needs. */
  setCrossfaderAssign(deck: DeckId, assign: CrossfaderAssign): void {
    this.sendMaster({ type: "crossfaderAssign", channel: DECK_IDS.indexOf(deck), assign });
  }
  setMasterGain(value: number): void {
    this.sendMaster({ type: "masterGain", value });
  }

  async dispose(): Promise<void> {
    for (const node of Object.values(this.deckNodes)) node.disconnect();
    this.masterNode.disconnect();
    await this.ctx.close();
  }
}
