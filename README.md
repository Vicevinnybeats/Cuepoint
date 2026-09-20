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
| `packages/library`  | Local track library — Dexie/IndexedDB, audio never leaves the device  |
| `apps/desktop`      | Electron shell wrapping the same build as a native desktop app        |

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
pnpm dev        # apps/web on :3000 (PWA — installable from the browser)
pnpm test       # Vitest across all packages
pnpm typecheck
```

### Desktop app

```sh
pnpm --filter @cuepoint/desktop start   # runs the Electron shell locally
pnpm --filter @cuepoint/desktop dist    # packages an installer (electron-builder)
```

`apps/desktop` doesn't duplicate the UI — it builds `apps/web` as a static
export (`CUEPOINT_TARGET=desktop next build`, see `next.config.ts`) and
serves it from a small bundled HTTP server (`apps/desktop/main.cjs`) that
sets the COOP/COEP headers `file://` can't carry. Same codebase, two
install targets: PWA in the browser, native shell on desktop.

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
- `packages/analysis` — offline BPM detection (energy-envelope
  autocorrelation with parabolic sub-frame refinement, folds octave errors
  into a 70-180 BPM range) and waveform peak extraction, both running in a
  Web Worker so a long track never blocks the main thread. 14 tests,
  including detection accuracy against synthetic click tracks at five
  tempos.
- `apps/web` — full deck + mixer UI (jogwheels, waveform display, 3-band EQ,
  filter, hot cues, crossfader with curve selection, pitch fader, level
  metering), responsive desktop (three-column) and mobile (stacked)
  layouts. Loading a local audio file runs it through decode + the analysis
  worker, then Play drives real playback through the worklet graph — BPM
  and the waveform shown are measured, not typed in. Sync retunes a deck's
  rate to match the other deck's measured BPM.
- `packages/library` — Dexie/IndexedDB persistence. A loaded track's
  metadata and audio Blob are saved locally (never synced anywhere); the
  library panel lists saved tracks and reloads either into deck A or B
  without re-picking the file. 5 tests (fake-indexeddb).
- Two install targets, one codebase: a real service worker
  (`apps/web/public/sw.js`, cache-first for same-origin GETs) makes the PWA
  work offline once installed, and `apps/desktop` wraps the same build as
  a native Electron app — verified: static export builds clean, and the
  bundled server was smoke-tested standalone (200 + correct COOP/COEP
  headers).

**Stubbed:**

- Key detection (`packages/analysis`) — the deck display still shows "--"
  for key.
- No Supabase sync — the library, cues and settings are local-only (by
  design for audio; cues/loops/settings syncing across devices is not
  implemented yet).
- No WASM DSP path — the kernels in `packages/dsp` are the reference
  implementation; a WASM build behind the same interface is a later swap.
- PWA icons are placeholder SVGs, not designed artwork.
- The jogwheel's visual spin rate assumes a 48 kHz AudioContext (see
  `apps/web/components/JogWheel.tsx`) — cosmetic only, does not affect audio.
