import { EngineProvider } from "@/lib/engine-provider";
import { DeckPanel } from "@/components/DeckPanel";
import { MixerChannel } from "@/components/MixerChannel";
import { MasterSection } from "@/components/MasterSection";

export default function Page() {
  return (
    <EngineProvider>
      <main className="flex min-h-dvh flex-col gap-3 bg-[#0a0a0b] p-3 lg:h-dvh lg:overflow-hidden">
        <header className="flex items-center justify-between px-1">
          <h1 className="text-sm font-bold tracking-[0.3em] text-neutral-300">CUEPOINT</h1>
          <span className="text-[10px] text-neutral-600">
            Tap Load Track on a deck, then Play — audio starts on your first tap.
          </span>
        </header>

        <div className="flex flex-1 flex-col gap-3 overflow-y-auto lg:grid lg:grid-cols-[1fr_auto_1fr] lg:items-start lg:overflow-visible">
          <DeckPanel deck="A" />

          <div className="flex flex-row gap-3 lg:flex-col">
            <MixerChannel deck="A" />
            <MasterSection />
            <MixerChannel deck="B" />
          </div>

          <DeckPanel deck="B" />
        </div>
      </main>
    </EngineProvider>
  );
}
