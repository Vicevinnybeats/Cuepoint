/**
 * WASM DSP runtime: one module instance, one linear memory, and a bump
 * allocator carving it into kernel state blocks and audio buffers.
 *
 * Audio buffers are allocated *inside* WASM memory and handed out as
 * Float32Array views onto it, so kernels process them in place — no copy in
 * or out per render quantum. Everything is allocated once, at processor
 * construction; nothing here runs inside process().
 */
import { EQ3_WASM_BYTES } from "./eq3-wasm.generated.js";

interface Eq3Exports {
  memory: WebAssembly.Memory;
  eq3_process(statePtr: number, bufferPtr: number, frames: number): void;
}

export class WasmDsp {
  private next = 1024; // leave a small guard region at address 0

  private constructor(readonly exports: Eq3Exports) {}

  /**
   * Synchronous on purpose: an AudioWorkletProcessor constructor can't
   * await. Compiling a few hundred bytes synchronously is fine off the main
   * thread. Throws if WebAssembly is unavailable — callers fall back to JS.
   */
  static create(bytes: Uint8Array<ArrayBuffer> = EQ3_WASM_BYTES): WasmDsp {
    const module = new WebAssembly.Module(bytes);
    const instance = new WebAssembly.Instance(module, {});
    return new WasmDsp(instance.exports as unknown as Eq3Exports);
  }

  get memory(): WebAssembly.Memory {
    return this.exports.memory;
  }

  /** Reserves `bytes` (8-byte aligned) and returns its address. */
  alloc(bytes: number): number {
    const address = (this.next + 7) & ~7;
    const end = address + bytes;
    if (end > this.memory.buffer.byteLength) {
      throw new Error(`WasmDsp out of memory (${end} > ${this.memory.buffer.byteLength})`);
    }
    this.next = end;
    return address;
  }

  /** A Float32Array that lives in WASM memory, for zero-copy processing. */
  allocF32(length: number): Float32Array {
    return new Float32Array(this.memory.buffer, this.alloc(length * 4), length);
  }

  f64View(address: number, length: number): Float64Array {
    return new Float64Array(this.memory.buffer, address, length);
  }

  isInMemory(view: Float32Array): boolean {
    return view.buffer === this.memory.buffer;
  }
}
