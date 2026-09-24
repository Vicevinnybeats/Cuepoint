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

A Cloudflare Worker (`apps/sync-worker`) backed by D1 syncs track metadata,
cue points, hot cues, playlists and mixer settings between your own devices
— never audio. No accounts: a random "sync key" generated on-device stands
in for one; paste it into another device's Sync panel to link them.

- Conflicts: last write wins, by the writing device's `updatedAt`.
- Pull cursors: the server's own clock (`server_updated_at`), so an edit
  made offline and pushed later is never skipped.
- Deletions (playlists) are tombstones, so they propagate.
- Track records only update tracks already loaded on that device (matched
  by filename + modified time) — there's no audio behind a remote-only one.
- Auto-sync (toggle in the panel): every minute, on returning to the app,
  and when the network comes back.

The D1 database `cuepoint-sync` already exists in the Cloudflare account,
with both migrations in `apps/sync-worker/migrations` applied. The Worker
itself has to be deployed with your credentials — see **Manual steps**.

## Testing

- Every module has Vitest unit tests.
- Every DSP piece has an offline render test: the processor is driven over a
  synthetic block sequence and the rendered output is asserted against an
  analytic expectation (gain law, filter magnitude response, resampler
  pitch/tempo, loop sample-accuracy).

## Status

Everything below is built, tested, and live at the URL above except where
**Manual steps** says otherwise. 158 tests (2 end-to-end tests run only
against a live Worker).

- **Audio engine** (`packages/dsp`, 92 tests) — biquad / 3-band EQ with
  kill / bipolar filter / limiter / meters / Catmull-Rom resampler with
  sample-accurate loops, as AudioWorklets. Playhead and meters reach the UI
  through a seqlock over `SharedArrayBuffer`, with a MessagePort fallback
  when the page isn't cross-origin isolated. The EQ runs in **WebAssembly**
  (hand-written WAT, zero-copy, bit-identical to the JS kernel, which stays
  as the fallback). Every kernel is per channel, and the processors
  themselves are tested in Node with a fake AudioWorklet scope.
- **Analysis** (`packages/analysis`, 20 tests) — BPM, musical key (as a
  Camelot code) and waveform peaks, in a Web Worker.
- **Deck** — CDJ-style CUE (set / hold-to-preview / return), 4 hot cues
  (long-press or right-click to delete), 1–16 beat loops, tempo sync,
  pitch fader, tap-to-seek waveform with cue markers, keyboard control on
  desktop.
- **Mixer** — gain, 3-band EQ, filter, channel faders, crossfader with three
  curves, master gain and limiter, stereo meters.
- **Library** (`packages/library`, 15 tests) — IndexedDB. Audio, analysis,
  cue points and hot cues persist across reloads; playlists with reorder.
- **Sync** (`packages/sync` + `apps/sync-worker`, 15 tests) — see above.
  Verified against the live D1 database and end to end under
  `wrangler dev --local`, including 2,500-record paging.
- **Install targets** — PWA (network-first page loads, offline assets, real
  PNG icons including the iOS home-screen icon), Electron desktop shell,
  and CI on every push.
- **UI** — Kontrol S2-inspired hardware look; portrait phone stacks, landscape
  phone and desktop put the decks either side of the mixer; launch splash.

## Manual steps

These need your accounts or your hands; everything else is done.

1. **Deploy the sync worker** (only needed for cross-device sync). Either:
   - GitHub → repo Settings → Secrets and variables → Actions: add
     `CLOUDFLARE_API_TOKEN` (Cloudflare dashboard → My Profile → API Tokens
     → "Edit Cloudflare Workers" template) and `CLOUDFLARE_ACCOUNT_ID`
     (Cloudflare dashboard, right sidebar of any Workers page). Then Actions
     → "Deploy sync worker" → Run workflow. Or:
   - Locally: `cd apps/sync-worker && npx wrangler login && npx wrangler deploy`.

   Either way you get a `https://cuepoint-sync.<you>.workers.dev` URL. Paste it
   into the Sync panel's **Worker URL** on each device, copy the **sync key**
   from one device into the other, and tick **Sync automatically**.
   Don't run `wrangler d1 migrations apply --remote` — the live database
   already has both migrations.
2. **Test on your phone** — open https://cuepoint-green.vercel.app, then
   Share → Add to Home Screen (iOS) or Install app (Android).
3. **Desktop app** (optional) — on your computer: `pnpm install`, then
   `pnpm --filter @cuepoint/desktop dist` builds an installer into
   `apps/desktop/release/`. Unsigned, so macOS/Windows will warn the first
   time you open it.
4. **Merge** this branch into `main` whenever you're happy with it. Right
   now the live site deploys from `claude/clever-dijkstra-ij3g5v`; after
   merging, check Vercel → cuepoint → Settings → Git → Production Branch is
   `main`.
