/** Client for the Cuepoint sync worker (apps/sync-worker). Last-write-wins:
 * the caller supplies `updatedAt` per record, and the server only accepts a
 * write that is at least as new as what it already has. */

export interface SyncRecord {
  id: string;
  data: unknown;
  updatedAt: number;
  deleted?: boolean;
}

export interface PulledItem {
  collection: string;
  id: string;
  data: string;
  /** The writing device's clock — decides conflicts. */
  updatedAt: number;
  deleted: number;
  /** The server's clock at write time — what pull cursors advance by. */
  serverUpdatedAt: number;
}

export interface PullPage {
  items: PulledItem[];
  /** Pass back as `since` on the next pull. Server-clock based. */
  cursor: number;
  more: boolean;
}

/** Safety valve for pullAll: a runaway server can't hang the client. */
const MAX_PAGES = 50;

export class SyncClient {
  constructor(
    private readonly baseUrl: string,
    private readonly syncKey: string,
  ) {}

  async push(collection: string, records: SyncRecord[]): Promise<void> {
    if (records.length === 0) return;
    const items = records.map((record) => ({
      collection,
      id: record.id,
      data: JSON.stringify(record.data),
      updatedAt: record.updatedAt,
      deleted: record.deleted ?? false,
    }));

    const response = await fetch(`${this.baseUrl}/sync/push`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ syncKey: this.syncKey, items }),
    });
    if (!response.ok) throw new Error(`sync push failed: ${response.status}`);
  }

  /** One page of changes the server received after cursor `since`. */
  async pull(collection: string, since: number): Promise<PullPage> {
    const url = new URL(`${this.baseUrl}/sync/pull`);
    url.searchParams.set("syncKey", this.syncKey);
    url.searchParams.set("since", String(since));
    url.searchParams.set("collection", collection);

    const response = await fetch(url.toString());
    if (!response.ok) throw new Error(`sync pull failed: ${response.status}`);
    const body = (await response.json()) as Partial<PullPage>;
    return {
      items: body.items ?? [],
      cursor: typeof body.cursor === "number" ? body.cursor : since,
      more: body.more === true,
    };
  }

  /** Every page after `since`, and the cursor to store for next time. */
  async pullAll(collection: string, since: number): Promise<{ items: PulledItem[]; cursor: number }> {
    const items: PulledItem[] = [];
    let cursor = since;
    for (let page = 0; page < MAX_PAGES; page++) {
      const result = await this.pull(collection, cursor);
      items.push(...result.items);
      cursor = result.cursor;
      if (!result.more) break;
    }
    return { items, cursor };
  }
}
