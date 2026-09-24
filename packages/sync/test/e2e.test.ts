/**
 * End-to-end against a running sync worker. Skipped unless SYNC_E2E_URL is
 * set, e.g. after `wrangler dev --local` in apps/sync-worker:
 *   SYNC_E2E_URL=http://127.0.0.1:8787 pnpm vitest run --root packages/sync e2e
 */
import { describe, it, expect } from "vitest";
import { SyncClient } from "../src/client.js";
import { generateSyncKey } from "../src/generate-key.js";

const url = process.env.SYNC_E2E_URL;

describe.runIf(url)("sync worker end-to-end", () => {
  it("pages through more records than one pull returns, without losing any", async () => {
    const client = new SyncClient(url!, generateSyncKey());
    const total = 2500; // > the worker's 2000-row page
    for (let start = 0; start < total; start += 500) {
      const batch = Array.from({ length: 500 }, (_, i) => ({
        id: `r${start + i}`,
        data: { n: start + i },
        updatedAt: 1,
      }));
      await client.push("tracks", batch);
    }

    const { items, cursor } = await client.pullAll("tracks", 0);
    const ids = new Set(items.map((i) => i.id));
    expect(ids.size).toBe(total);
    expect(cursor).toBeGreaterThan(0);

    // Nothing new since the returned cursor.
    expect((await client.pullAll("tracks", cursor)).items).toHaveLength(0);
  });

  it("round-trips a tombstone", async () => {
    const client = new SyncClient(url!, generateSyncKey());
    await client.push("playlists", [{ id: "p1", data: { name: "x" }, updatedAt: 5, deleted: true }]);
    const { items } = await client.pullAll("playlists", 0);
    expect(items[0]?.deleted).toBe(1);
  });
});
