# Cuepoint

A professional DJ application for the web. Virtual DJ / Traktor Pro workflows,
terminology and behaviour — not a toy.

## Try it now

**https://cuepoint-green.vercel.app** — deployed from this branch, auto-
redeploys on every push. Open it on your phone: tap Load Track on a deck to
pick a local audio file, then Play. iOS Safari and Chrome will offer "Add to
Home Screen" — that installs it as the PWA.

(This is a personal Vercel Hobby project, not a production service — expect
it to move if the branch merges or the project gets renamed.)

## Architecture

| Package             | Responsibility                                                        |
| ------------------- | --------------------------------------------------------------------- |
| `apps/web`          | Next.js 15 App Router UI, PWA, installable, cross-origin isolated      |
| `packages/engine`   | Framework-agnostic audio engine: decks, mixer, transport, cues, sync   |
| `packages/analysis` | Web Workers: BPM detection, key detection, waveform peaks              |
| `packages/dsp`      | AudioWorklet processors + WASM kernels                                 |
| `packages/library`  | Local track library — Dexie/IndexedDB, audio never leaves the device  |
| `packages/sync`     | Client for the Cloudflare sync worker (metadata/cues/settings only)   |
| `apps/desktop`      | Electron shell wrapping the same build as a native desktop app        |
| `apps/sync-worker`  | Cloudflare Worker + D1: last-write-wins sync store                    |

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
  A Cloudflare Worker + D1 syncs metadata, cues and settings only, keyed by
  a random per-install "sync key" instead of an account (see below).

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

### Sync (Cloudflare)

Metadata sync is a Cloudflare Worker (`apps/sync-worker`) backed by D1 —
`sync_items(sync_key, collection, id, data, updated_at, deleted)`, last-write-
wins on `updated_at`. No accounts: a random "sync key" generated on-device
(`packages/sync`) stands in for one, and pasting it into another device's
Sync panel links them. Only track metadata, hot cues, and mixer settings
sync — never audio, and sync only updates a track that's already loaded
locally on both devices (matched by filename + modified time); it never
creates a library entry from a remote record, because there's no audio
behind it on this device.

The D1 database (`cuepoint-sync`) already exists in this Cloudflare
account with its schema applied. Deploying the Worker itself needs a login,
which isn't something this session can do on your behalf:

```sh
cd apps/sync-worker
npx wrangler login
npx wrangler deploy
```

That prints a `*.workers.dev` URL — paste it into the Sync panel's Worker
URL field in the app.

## Testing

- Every module has Vitest unit tests.
- Every DSP piece has an offline render test: the processor is driven over a
  synthetic block sequence and the rendered output is asserted against an
  analytic expectation (gain law, filter magnitude response, resampler
  pitch/tempo, loop sample-accuracy).

## Status

**Done:**

- `packages/dsp` — biquad/EQ3/filter/limiter/meter/resampler kernels, seqlock
  shared-state protocol, deck + master AudioWorklet processors. 75 tests.
- `packages/engine` — UI store (zustand/vanilla), `EngineClient` browser
  facade over the AudioContext/worklet graph, pitch/sync math.
- `packages/analysis` — offline BPM detection (energy-envelope
  autocorrelation with parabolic sub-frame refinement, folds octave errors
  into a 70-180 BPM range), key detection (12-bin chroma via a minimal FFT,
  correlated against the Krumhansl-Kessler profiles, reported as a Camelot
  wheel code — the harmonic-mixing notation DJ software uses), and
  waveform peak extraction. All three run in a Web Worker so a long track
  never blocks the main thread. 20 tests, including BPM accuracy against
  synthetic click tracks at five tempos and key detection against major/
  minor triads.
- `apps/web` — full deck + mixer UI (jogwheels, waveform display, 3-band EQ,
  filter, hot cues, crossfader with curve selection, pitch fader, level
  metering), responsive desktop (three-column) and mobile (stacked)
  layouts. Loading a local audio file runs it through decode + the analysis
  worker, then Play drives real playback through the worklet graph — BPM
  and the waveform shown are measured, not typed in. Sync retunes a deck's
  rate to match the other deck's measured BPM.
- `packages/library` — Dexie/IndexedDB persistence. A loaded track's
  metadata, hot cues and audio Blob are saved locally; the library panel
  lists saved tracks and reloads either into deck A or B (cues restored)
  without re-picking the file. 6 tests (fake-indexeddb).
- `packages/sync` + `apps/sync-worker` — Cloudflare Worker/D1 sync for
  track metadata, hot cues and mixer settings, last-write-wins by
  `updatedAt`, keyed by a random per-install sync key instead of an
  account. Verified against the live D1 database (a stale write with an
  older `updatedAt` is correctly rejected). 7 tests on the client
  (mocked fetch); the Worker itself needs a login to deploy, which this
  session can't do — see "Sync (Cloudflare)" above.
- Two install targets, one codebase: a real service worker
  (`apps/web/public/sw.js`, cache-first for same-origin GETs) makes the PWA
  work offline once installed, and `apps/desktop` wraps the same build as
  a native Electron app — verified: static export builds clean, and the
  bundled server was smoke-tested standalone (200 + correct COOP/COEP
  headers).
- Deployed to Vercel (git-linked, auto-redeploys on push) for real phone
  testing — a local dev server isn't installable as a PWA since it isn't
  a secure context. See "Try it now" above.
- Mobile-first layout: the mixer no longer forces three channel strips
  into one unusable row on a phone screen, touch targets are a real ~44px,
  and the jog wheel sizes responsively instead of a fixed 200px.

**Stubbed:**

- The sync worker is written and its D1 database exists, but isn't
  deployed — `npx wrangler deploy` from `apps/sync-worker` needs a login
  only you can do (see "Sync (Cloudflare)" above). Playlists aren't synced
  yet, only track metadata/cues and mixer settings.
- No WASM DSP path — the kernels in `packages/dsp` are the reference
  implementation; a WASM build behind the same interface is a later swap.
- PWA icons are placeholder SVGs, not designed artwork.
- The jogwheel's visual spin rate assumes a 48 kHz AudioContext (see
  `apps/web/components/JogWheel.tsx`) — cosmetic only, does not affect audio.
