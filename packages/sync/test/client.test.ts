import { describe, it, expect, beforeEach, vi } from "vitest";
import { SyncClient } from "../src/client.js";

const BASE_URL = "https://sync.example.com";
const SYNC_KEY = "test-key-0123456789";

describe("SyncClient", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  it("push posts the sync key and JSON-encodes each record's data", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValue(new Response(null, { status: 200 }));

    const client = new SyncClient(BASE_URL, SYNC_KEY);
    await client.push("tracks", [{ id: "t1", data: { bpm: 128 }, updatedAt: 100 }]);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${BASE_URL}/sync/push`);
    const body = JSON.parse(init.body as string);
    expect(body.syncKey).toBe(SYNC_KEY);
    expect(body.items).toEqual([
      { collection: "tracks", id: "t1", data: JSON.stringify({ bpm: 128 }), updatedAt: 100, deleted: false },
    ]);
  });

  it("push is a no-op for an empty record list", async () => {
    const fetchMock = vi.mocked(fetch);
    const client = new SyncClient(BASE_URL, SYNC_KEY);
    await client.push("tracks", []);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("push throws on a non-ok response", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValue(new Response(null, { status: 500 }));
    const client = new SyncClient(BASE_URL, SYNC_KEY);
    await expect(client.push("tracks", [{ id: "t1", data: {}, updatedAt: 1 }])).rejects.toThrow(/500/);
  });

  it("pull builds the query string and parses the response", async () => {
    const fetchMock = vi.mocked(fetch);
    const items = [{ collection: "tracks", id: "t1", data: "{}", updatedAt: 5, deleted: 0 }];
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ items }), { status: 200 }));

    const client = new SyncClient(BASE_URL, SYNC_KEY);
    const result = await client.pull("tracks", 42);

    const [url] = fetchMock.mock.calls[0] as [string];
    const parsed = new URL(url);
    expect(parsed.pathname).toBe("/sync/pull");
    expect(parsed.searchParams.get("syncKey")).toBe(SYNC_KEY);
    expect(parsed.searchParams.get("since")).toBe("42");
    expect(parsed.searchParams.get("collection")).toBe("tracks");
    expect(result).toEqual(items);
  });

  it("pull throws on a non-ok response", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValue(new Response(null, { status: 400 }));
    const client = new SyncClient(BASE_URL, SYNC_KEY);
    await expect(client.pull("tracks", 0)).rejects.toThrow(/400/);
  });
});
