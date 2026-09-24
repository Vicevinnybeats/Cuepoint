import { EngineProvider } from "@/lib/engine-provider";
import { DeckPanel } from "@/components/DeckPanel";
import { MixerChannel } from "@/components/MixerChannel";
import { MasterSection } from "@/components/MasterSection";
import { LibraryPanel } from "@/components/LibraryPanel";
import { SyncPanel } from "@/components/SyncPanel";

export default function Page() {
  return (
    <EngineProvider>
      <main className="flex min-h-dvh flex-col gap-3 bg-[#0a0a0b] p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-[max(0.75rem,env(safe-area-inset-top))]">
        <header className="flex items-center justify-between gap-2 px-1">
          <h1 className="text-sm font-bold tracking-[0.3em] text-neutral-300">CUEPOINT</h1>
          <span className="hidden text-[10px] text-neutral-600 sm:inline">
            Tap Load Track on a deck, then Play — audio starts on your first tap.
          </span>
        </header>

        {/* Portrait phone: everything stacks top to bottom in one column
            (deck A, its channel strip, master, deck B's channel strip,
            deck B) — a three-wide mixer row does not fit a narrow screen.
            Landscape phone and desktop both get the hardware layout: deck |
            channel A / master / channel B | deck, side by side, matching a
            real 2-channel mixer (and the Kontrol S2 iPad layout this app
            takes its look from). `landscape:` triggers on viewport aspect
            ratio, independent of `lg:`'s width breakpoint, so a phone
            rotated sideways gets this even though it's narrower than lg. */}
        <div className="flex flex-col gap-3 landscape:grid landscape:grid-cols-[1fr_auto_1fr] landscape:items-start landscape:gap-2 lg:grid lg:grid-cols-[1fr_auto_1fr] lg:items-start lg:gap-3">
          <DeckPanel deck="A" />

          <div className="flex flex-col gap-3 landscape:gap-2 lg:gap-3">
            <MixerChannel deck="A" />
            <MasterSection />
            <MixerChannel deck="B" />
          </div>

          <DeckPanel deck="B" />
        </div>

        <div className="grid gap-3 lg:grid-cols-2">
          <LibraryPanel />
          <SyncPanel />
        </div>
      </main>
    </EngineProvider>
  );
}
