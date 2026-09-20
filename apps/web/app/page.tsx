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

        {/* Mobile: everything stacks top to bottom in one column (deck A,
            its channel strip, master, deck B's channel strip, deck B) — a
            three-wide mixer row does not fit a phone screen. Desktop puts
            the channel strips in a vertical column sandwiched between the
            two decks, matching a real mixer's layout. */}
        <div className="flex flex-col gap-3 lg:grid lg:grid-cols-[1fr_auto_1fr] lg:items-start">
          <DeckPanel deck="A" />

          <div className="flex flex-col gap-3">
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
