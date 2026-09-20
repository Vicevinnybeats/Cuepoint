# Cuepoint

A professional DJ application for the web. Virtual DJ / Traktor Pro workflows,
terminology and behaviour — not a toy.

## Architecture

| Package             | Responsibility                                                        |
| ------------------- | --------------------------------------------------------------------- |
| `apps/web`          | Next.js 15 App Router UI, PWA, installable, cross-origin isolated      |
| `packages/engine`   | Framework-agnostic audio engine: decks, mixer, transport, cues, sync   |
| `packages/analysis` | Web Workers: BPM detection, key detection, waveform peaks              |
| `packages/dsp`      | AudioWorklet processors + WASM kernels                                 |

### Hard rules

- All audio runs on the audio thread inside `AudioWorkletProcessor`s.
- Inside `process()`: no allocations, no `console.log`, no locks, no `await`.
  Every buffer is pre-allocated at construction.
- Audio thread → main thread state (playhead, meters, loop state) travels
  through `SharedArrayBuffer` with atomics; a `MessagePort` path is the
  fallback when cross-origin isolation is unavailable.
- The engine is the source of truth. Zustand holds UI state only. The UI reads
  playhead/meters from shared memory on `requestAnimationFrame` — never through
  React state at audio rate.
- Audio files never leave the device. IndexedDB (Dexie) is the library.
  Supabase syncs metadata, cues, loops, playlists and settings only, with RLS
  per user.

### Targets

- 60 fps on a mid-range phone.
- Output latency under 30 ms.

## Development

```sh
pnpm install
pnpm dev        # apps/web on :3000
pnpm test       # Vitest across all packages
pnpm typecheck
```

Cross-origin isolation is required for `SharedArrayBuffer`. `apps/web` sets
`Cross-Origin-Opener-Policy: same-origin` and
`Cross-Origin-Embedder-Policy: require-corp`; without them the engine falls
back to `MessagePort` transport and reports reduced timing fidelity.

## Testing

- Every module has Vitest unit tests.
- Every DSP piece has an offline render test: the processor is driven over a
  synthetic block sequence and the rendered output is asserted against an
  analytic expectation (gain law, filter magnitude response, resampler
  pitch/tempo, loop sample-accuracy).

## Status

**Done:**

- `packages/dsp` — biquad/EQ3/filter/limiter/meter/resampler kernels, seqlock
  shared-state protocol, deck + master AudioWorklet processors. 87 tests.
- `packages/engine` — UI store (zustand/vanilla), `EngineClient` browser
  facade over the AudioContext/worklet graph, pitch/sync math.
- `apps/web` — full deck + mixer UI (jogwheels, 3-band EQ, filter, hot cues,
  crossfader with curve selection, pitch fader, level metering), responsive
  desktop (three-column) and mobile (stacked) layouts. Loading a local audio
  file and pressing Play drives real playback through the worklet graph.

**Stubbed:**

- `packages/analysis` — BPM/key/waveform detection. BPM is currently typed in
  by hand per track; Sync reflects UI intent only until this lands.
- No waveform display (needs the peaks worker above).
- No IndexedDB library or Supabase sync — tracks load per-session from the
  file picker, nothing persists across reloads.
- No WASM DSP path — the kernels in `packages/dsp` are the reference
  implementation; a WASM build behind the same interface is a later swap.
- PWA icons are placeholder SVGs, not designed artwork.
- The jogwheel's visual spin rate assumes a 48 kHz AudioContext (see
  `apps/web/components/JogWheel.tsx`) — cosmetic only, does not affect audio.
