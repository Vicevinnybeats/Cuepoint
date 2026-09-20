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
  updatedAt: number;
  deleted: number;
}

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

  async pull(collection: string, since: number): Promise<PulledItem[]> {
    const url = new URL(`${this.baseUrl}/sync/pull`);
    url.searchParams.set("syncKey", this.syncKey);
    url.searchParams.set("since", String(since));
    url.searchParams.set("collection", collection);

    const response = await fetch(url.toString());
    if (!response.ok) throw new Error(`sync pull failed: ${response.status}`);
    const body = (await response.json()) as { items: PulledItem[] };
    return body.items;
  }
}
