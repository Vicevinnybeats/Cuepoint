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
      <main className="flex min-h-dvh flex-col gap-3 bg-[#0a0a0b] p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-[max(0.75rem,env(safe-area-inset-top))] landscape:gap-1 landscape:p-1.5 landscape:pb-[max(0.125rem,env(safe-area-inset-bottom))] landscape:pt-[max(0.125rem,env(safe-area-inset-top))] lg:landscape:gap-3 lg:landscape:p-3 lg:landscape:pb-[max(0.75rem,env(safe-area-inset-bottom))] lg:landscape:pt-[max(0.75rem,env(safe-area-inset-top))]">
        <header className="flex items-center justify-between gap-2 px-1 landscape:hidden lg:landscape:flex">
          <h1 className="text-sm font-bold tracking-[0.3em] text-neutral-300">CUEPOINT</h1>
          <span className="hidden text-[10px] text-neutral-600 sm:inline">
            Tap Load Track on a deck, then Play — audio starts on your first tap.
          </span>
        </header>

        {/* Portrait phone: everything stacks top to bottom in one column —
            a wide row of mixer panels does not fit a narrow screen. Groups
            read in the same left-to-right order the grid below uses, so
            scrolling down still reads as "left decks, left channels,
            master, right channels, right decks" without the grid.

            Landscape phone and desktop both get the hardware layout, 5
            columns: decks A/C (stacked) | channels A/C (2 mixer tracks,
            "left") | master + crossfader | channels D/B (2 mixer tracks,
            "right") | decks B/D (stacked) — matching a real 4-channel
            mixer's strip, where each pair of channels flanks the shared
            master/crossfader section rather than all 4 channels sitting in
            one block. Each channel pair stays a narrow vertical stack in
            landscape (phone width can't fit two full channel strips side by
            side on top of everything else) and only goes side by side on
            desktop. `landscape:` triggers on viewport aspect ratio,
            independent of `lg:`'s width breakpoint, so a phone rotated
            sideways gets this even though it's narrower than lg. */}
        <div className="flex flex-col gap-3 landscape:grid landscape:grid-cols-[1fr_auto_auto_auto_1fr] landscape:items-start landscape:gap-1 lg:landscape:gap-3 lg:grid lg:grid-cols-[1fr_auto_auto_auto_1fr] lg:items-start lg:gap-3">
          <div className="flex flex-col gap-3 landscape:gap-1 lg:landscape:gap-3 lg:gap-3">
            <DeckPanel deck="A" />
            <DeckPanel deck="C" />
          </div>

          <div className="flex flex-col gap-3 landscape:flex-row landscape:gap-1 lg:landscape:gap-3 lg:flex-row lg:gap-3">
            <MixerChannel deck="A" />
            <MixerChannel deck="C" />
          </div>

          <div className="flex flex-col gap-3 landscape:gap-1 lg:landscape:gap-3 lg:gap-3">
            <MasterSection />
            <CrossfaderPanel />
          </div>

          <div className="flex flex-col gap-3 landscape:flex-row landscape:gap-1 lg:landscape:gap-3 lg:flex-row lg:gap-3">
            <MixerChannel deck="D" />
            <MixerChannel deck="B" />
          </div>

          <div className="flex flex-col gap-3 landscape:gap-1 lg:landscape:gap-3 lg:gap-3">
            <DeckPanel deck="B" />
            <DeckPanel deck="D" />
          </div>
        </div>

        {/* Loading a track doesn't need this panel — every deck has its own
            Load Track file picker — so on a landscape phone (where the deck
            + mixer grid above already fills the screen) it's dropped rather
            than forcing a scroll; it comes back in portrait and on desktop,
            where there's room. */}
        <div className="grid gap-3 landscape:hidden lg:landscape:grid lg:grid-cols-2">
          <LibraryPanel />
          <SyncPanel />
        </div>
      </main>
    </EngineProvider>
  );
}
