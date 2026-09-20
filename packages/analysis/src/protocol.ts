/** Messages between the main thread and the analysis worker. */

export interface AnalyzeRequest {
  type: "analyze";
  requestId: number;
  /** Mono channel data, transferred. */
  channelData: ArrayBuffer;
  sampleRate: number;
  waveformColumns: number;
}

export interface AnalyzeResult {
  type: "result";
  requestId: number;
  bpm: number;
  /** Camelot wheel code, e.g. "8A". */
  key: string;
  /** Float32Array bytes, transferred back. */
  peaks: ArrayBuffer;
}
