"use client";

import { useEffect, useState } from "react";

/** A narrow (phone-width) viewport in portrait orientation. The manifest
 * requests landscape on launch (see public/manifest.webmanifest), but
 * that's an Android-only guarantee — iOS home-screen apps ignore it, and
 * any browser tab can simply be rotated back — so the UI still needs a
 * runtime fallback for whenever a phone actually ends up in portrait. */
const QUERY = "(orientation: portrait) and (max-width: 1023px)";

export function usePhonePortrait(): boolean {
  const [portrait, setPortrait] = useState(false);

  useEffect(() => {
    const mql = window.matchMedia(QUERY);
    setPortrait(mql.matches);
    const onChange = (e: MediaQueryListEvent) => setPortrait(e.matches);
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, []);

  return portrait;
}
