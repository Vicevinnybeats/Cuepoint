-- Already applied to the cuepoint-sync D1 database.
CREATE TABLE sync_items (
  sync_key TEXT NOT NULL,
  collection TEXT NOT NULL,
  id TEXT NOT NULL,
  data TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  deleted INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (sync_key, collection, id)
);
CREATE INDEX idx_sync_items_lookup ON sync_items (sync_key, collection, updated_at);
