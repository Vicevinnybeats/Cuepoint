"use client";

import { useEffect, useState } from "react";

/** Reuses Tailwind's own `2xl` breakpoint (1536px) so this JS-driven size
 * tier lines up with any `2xl:` CSS classes placed alongside it. Needed
 * because knob/slider/meter sizes are numeric pixel props, not classes —
 * see useCompactLayout's note on why those can't be sized by CSS alone.
 *
 * The mixer's grid columns are `auto`-width, so on a roomy desktop monitor
 * they never grow to use the extra space the way the deck columns (`1fr`)
 * do — this hook lets the mixer's own controls step up to a bigger size
 * tier instead of sitting tiny in the middle of a wide window. */
const QUERY = "(min-width: 1536px)";

export function useWideDesktop(): boolean {
  const [wide, setWide] = useState(false);

  useEffect(() => {
    const mql = window.matchMedia(QUERY);
    setWide(mql.matches);
    const onChange = (e: MediaQueryListEvent) => setWide(e.matches);
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, []);

  return wide;
}
