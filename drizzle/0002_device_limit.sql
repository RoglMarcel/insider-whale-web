ALTER TABLE access_keys ADD COLUMN device_limit INTEGER NOT NULL DEFAULT 2 CHECK (device_limit BETWEEN 1 AND 100);
--> statement-breakpoint
CREATE TABLE access_devices (
  key_id TEXT NOT NULL REFERENCES access_keys(id),
  device_hash TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (key_id, device_hash)
);
