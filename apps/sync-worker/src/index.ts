/**
 * Cuepoint sync worker. Last-write-wins key-value sync for track metadata,
 * hot cues and app settings — never audio. A "sync key" (a random string
 * generated on-device, see packages/sync/src/generate-key.ts) stands in for
 * an account: whoever holds the key can read/write its rows. No email,
 * password or OAuth — this links a person's own devices, not a public
 * multi-tenant service.
 */

export interface Env {
  DB: D1Database;
}

interface PushItem {
  collection: string;
  id: string;
  data: string;
  updatedAt: number;
  deleted?: boolean;
}

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

const MAX_ITEMS_PER_PUSH = 500;
const MAX_ITEMS_PER_PULL = 2000;

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}

function isValidSyncKey(key: unknown): key is string {
  return typeof key === "string" && key.length >= 8 && key.length <= 128;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === "OPTIONS") return new Response(null, { headers: CORS_HEADERS });

    const url = new URL(request.url);
    if (request.method === "POST" && url.pathname === "/sync/push") return handlePush(request, env);
    if (request.method === "GET" && url.pathname === "/sync/pull") return handlePull(url, env);
    return json({ error: "not found" }, 404);
  },
};

async function handlePush(request: Request, env: Env): Promise<Response> {
  let body: { syncKey?: unknown; items?: unknown };
  try {
    body = await request.json();
  } catch {
    return json({ error: "invalid JSON" }, 400);
  }

  if (!isValidSyncKey(body.syncKey)) return json({ error: "invalid syncKey" }, 400);
  const items = Array.isArray(body.items) ? (body.items as PushItem[]) : [];
  if (items.length === 0) return json({ accepted: 0 });
  if (items.length > MAX_ITEMS_PER_PUSH) return json({ error: "too many items" }, 400);

  // Last-write-wins: the incoming row only overwrites the stored one when
  // its updatedAt is at least as new, so a stale push from a device that
  // hasn't pulled recently can't clobber a newer change.
  const statements = items.map((item) =>
    env.DB.prepare(
      `INSERT INTO sync_items (sync_key, collection, id, data, updated_at, deleted)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(sync_key, collection, id) DO UPDATE SET
         data = excluded.data,
         updated_at = excluded.updated_at,
         deleted = excluded.deleted
       WHERE excluded.updated_at >= sync_items.updated_at`,
    ).bind(body.syncKey, item.collection, item.id, item.data, item.updatedAt, item.deleted ? 1 : 0),
  );
  await env.DB.batch(statements);

  return json({ accepted: items.length });
}

async function handlePull(url: URL, env: Env): Promise<Response> {
  const syncKey = url.searchParams.get("syncKey");
  const since = Number(url.searchParams.get("since") ?? "0");
  const collection = url.searchParams.get("collection");
  if (!isValidSyncKey(syncKey)) return json({ error: "invalid syncKey" }, 400);

  let query =
    "SELECT collection, id, data, updated_at as updatedAt, deleted FROM sync_items WHERE sync_key = ? AND updated_at > ?";
  const bindings: (string | number)[] = [syncKey, since];
  if (collection) {
    query += " AND collection = ?";
    bindings.push(collection);
  }
  query += ` ORDER BY updated_at ASC LIMIT ${MAX_ITEMS_PER_PULL}`;

  const result = await env.DB.prepare(query)
    .bind(...bindings)
    .all();
  return json({ items: result.results ?? [] });
}
