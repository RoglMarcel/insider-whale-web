CREATE TABLE access_keys (
  id TEXT PRIMARY KEY,
  key_hash TEXT NOT NULL UNIQUE,
  hint TEXT NOT NULL,
  duration TEXT NOT NULL CHECK (duration IN ('4weeks','6months','1year','lifetime')),
  label TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL,
  activated_at INTEGER,
  expires_at INTEGER,
  revoked_at INTEGER
);
--> statement-breakpoint
CREATE TABLE access_sessions (
  token_hash TEXT PRIMARY KEY,
  role TEXT NOT NULL CHECK (role IN ('member','admin')),
  key_id TEXT REFERENCES access_keys(id),
  expires_at INTEGER NOT NULL
);
--> statement-breakpoint
CREATE INDEX access_sessions_key ON access_sessions(key_id);
--> statement-breakpoint
CREATE INDEX access_sessions_expiry ON access_sessions(expires_at);
--> statement-breakpoint
CREATE TABLE access_rate_limits (
  bucket TEXT PRIMARY KEY,
  attempts INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
