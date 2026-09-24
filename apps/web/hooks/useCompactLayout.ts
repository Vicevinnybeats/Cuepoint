"use client";

import { useEffect, useState } from "react";

/** Matches the same condition the CSS `landscape:` utilities target in
 * practice: a narrow (phone-width) viewport in landscape orientation. Below
 * `lg`'s width, a landscape phone doesn't have the height to show 2 stacked
 * decks plus the mixer at desktop sizes, so components that take a pixel
 * height/size prop (canvas-based Waveform, LevelMeter, the numeric Slider
 * height) need this to pick a smaller number in JS — CSS classes alone only
 * cover padding/gap/font-size, not those.
 */
const QUERY = "(orientation: landscape) and (max-width: 1023px)";

export function useCompactLayout(): boolean {
  const [compact, setCompact] = useState(false);

  useEffect(() => {
    const mql = window.matchMedia(QUERY);
    setCompact(mql.matches);
    const onChange = (e: MediaQueryListEvent) => setCompact(e.matches);
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, []);

  return compact;
}
