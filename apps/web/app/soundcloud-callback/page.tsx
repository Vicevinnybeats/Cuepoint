"use client";

import { useEffect, useState } from "react";
import { completeConnect } from "@/lib/soundcloud";

/** SoundCloud redirects here with `?code=...` after the user approves
 * access. Exchanges it for a token (see lib/soundcloud.ts) and bounces
 * back to the app. */
export default function SoundCloudCallbackPage() {
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    const authError = params.get("error");
    if (authError) {
      setError(authError);
      return;
    }
    if (!code) {
      setError("No authorization code in the redirect.");
      return;
    }
    completeConnect(code, `${window.location.origin}/soundcloud-callback`)
      .then(() => {
        window.location.href = "/";
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
  }, []);

  return (
    <main className="flex min-h-dvh items-center justify-center bg-[#0a0a0b] p-6 text-center">
      {error ? (
        <div className="flex flex-col items-center gap-2">
          <p className="text-sm font-bold text-red-400">Couldn&apos;t connect to SoundCloud</p>
          <p className="max-w-xs text-xs text-neutral-500">{error}</p>
          <a href="/" className="text-xs text-amber underline">
            Back to Cuepoint
          </a>
        </div>
      ) : (
        <p className="text-sm text-neutral-300">Connecting to SoundCloud…</p>
      )}
    </main>
  );
}
