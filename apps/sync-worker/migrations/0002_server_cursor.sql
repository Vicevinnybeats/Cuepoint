-- Already applied to the cuepoint-sync D1 database.
-- Pull cursors use the server's clock, not the writing device's: a device
-- that edits offline and syncs later would otherwise write an updated_at
-- older than another device's last-pull cursor, and never be seen.
ALTER TABLE sync_items ADD COLUMN server_updated_at INTEGER NOT NULL DEFAULT 0;
CREATE INDEX idx_sync_items_cursor ON sync_items (sync_key, collection, server_updated_at);
