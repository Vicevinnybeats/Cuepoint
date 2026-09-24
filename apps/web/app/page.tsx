import { EngineProvider } from "@/lib/engine-provider";
import { DeckPanel } from "@/components/DeckPanel";
import { MixerChannel } from "@/components/MixerChannel";
import { MasterSection } from "@/components/MasterSection";
import { CrossfaderPanel } from "@/components/CrossfaderPanel";
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

        {/* Portrait phone: everything stacks top to bottom in one column —
            a wide row of mixer panels does not fit a narrow screen. Decks
            group by mixing pair (A/B, C/D — see DeckPanel's SYNC_PARTNER),
            so scrolling down reads as "left stack, mixer, right stack" even
            without the grid.

            Landscape phone and desktop both get the hardware layout: two
            decks stacked on the left (A over C) | the 4-channel mixer
            (channel A, channel C, master, crossfader, channel D, channel B)
            | two decks stacked on the right (B over D). Each channel strip
            sits next to the deck it borders, with the two outer decks'
            channels (A, B) nearest their own decks and C/D's channels
            innermost next to master — a straight generalisation of the old
            2-deck "deck | 4 mixer panels | deck" strip. `landscape:`
            triggers on viewport aspect ratio, independent of `lg:`'s width
            breakpoint, so a phone rotated sideways gets this even though
            it's narrower than lg. */}
        <div className="flex flex-col gap-3 landscape:grid landscape:grid-cols-[1fr_auto_1fr] landscape:items-start landscape:gap-2 lg:grid lg:grid-cols-[1fr_auto_1fr] lg:items-start lg:gap-3">
          <div className="flex flex-col gap-3 landscape:gap-2 lg:gap-3">
            <DeckPanel deck="A" />
            <DeckPanel deck="C" />
          </div>

          {/* Stays a narrow vertical stack in landscape (phone width can't
              fit 6 channel strips side by side); desktop has the room to
              lay the mixer out horizontally like real mixer hardware. */}
          <div className="flex flex-col gap-3 landscape:gap-2 lg:flex-row lg:items-start lg:gap-3">
            <MixerChannel deck="A" />
            <MixerChannel deck="C" />
            <MasterSection />
            <CrossfaderPanel />
            <MixerChannel deck="D" />
            <MixerChannel deck="B" />
          </div>

          <div className="flex flex-col gap-3 landscape:gap-2 lg:gap-3">
            <DeckPanel deck="B" />
            <DeckPanel deck="D" />
          </div>
        </div>

        <div className="grid gap-3 lg:grid-cols-2">
          <LibraryPanel />
          <SyncPanel />
        </div>
      </main>
    </EngineProvider>
  );
}
