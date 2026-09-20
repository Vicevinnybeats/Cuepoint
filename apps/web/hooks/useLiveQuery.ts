"use client";

import { useEffect, useState } from "react";
import { liveQuery } from "dexie";

/** Subscribes to a Dexie liveQuery — re-runs `querier` whenever the tables
 * it read from change, no polling or manual refresh calls needed. */
export function useLiveQuery<T>(querier: () => Promise<T> | T, deps: unknown[], initial: T): T {
  const [value, setValue] = useState<T>(initial);

  useEffect(() => {
    const subscription = liveQuery(querier).subscribe({
      next: setValue,
      error: (error: unknown) => {
        console.error("useLiveQuery failed:", error);
      },
    });
    return () => subscription.unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return value;
}
