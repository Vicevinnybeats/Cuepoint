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

import { createSharedStateBuffer, SharedStateReader } from "@cuepoint/dsp/shared";
import type { DeckMessage, MasterMessage } from "@cuepoint/dsp";
import type { CrossfaderCurve } from "@cuepoint/dsp/kernels";
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

    const bufferA = createSharedStateBuffer();
    const bufferB = createSharedStateBuffer();
    const bufferMaster = createSharedStateBuffer();

    const deckA = new AudioWorkletNode(ctx, "deck-processor", {
      numberOfInputs: 0,
      numberOfOutputs: 1,
      outputChannelCount: [2],
      processorOptions: { sharedState: bufferA },
    });
    const deckB = new AudioWorkletNode(ctx, "deck-processor", {
      numberOfInputs: 0,
      numberOfOutputs: 1,
      outputChannelCount: [2],
      processorOptions: { sharedState: bufferB },
    });
    const master = new AudioWorkletNode(ctx, "master-processor", {
      numberOfInputs: 2,
      numberOfOutputs: 1,
      outputChannelCount: [2],
      processorOptions: { sharedState: bufferMaster },
    });

    deckA.connect(master, 0, 0);
    deckB.connect(master, 0, 1);
    master.connect(ctx.destination);

    return new EngineClient(ctx, { A: deckA, B: deckB }, master, {
      A: new SharedStateReader(bufferA),
      B: new SharedStateReader(bufferB),
      master: new SharedStateReader(bufferMaster),
    });
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
  setMasterGain(value: number): void {
    this.sendMaster({ type: "masterGain", value });
  }

  async dispose(): Promise<void> {
    this.deckNodes.A.disconnect();
    this.deckNodes.B.disconnect();
    this.masterNode.disconnect();
    await this.ctx.close();
  }
}
