-- RelaxPump website: tables (docs/website-brief.md §4). Matches lib/db/schema.ts.

CREATE TABLE content (
  section    TEXT NOT NULL,
  key        TEXT NOT NULL,
  draft      TEXT,              -- JSON, unsaved edits
  published  TEXT,              -- JSON, what the site shows
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (section, key)
);

CREATE TABLE products (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  category    TEXT NOT NULL,
  price       INTEGER,          -- rupees; NULL = coming soon
  tag         TEXT NOT NULL DEFAULT '',
  art         TEXT NOT NULL DEFAULT 'ctrl',
  image_key   TEXT,
  visible     INTEGER NOT NULL DEFAULT 1,
  featured    INTEGER NOT NULL DEFAULT 0,
  sort        INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE media (
  id         TEXT PRIMARY KEY,
  r2_key     TEXT NOT NULL UNIQUE,
  name       TEXT NOT NULL,
  type       TEXT NOT NULL,
  size       INTEGER NOT NULL,
  used_in    TEXT,
  created_at INTEGER NOT NULL
);

CREATE TABLE orders (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  phone      TEXT NOT NULL,
  address    TEXT NOT NULL,
  town       TEXT NOT NULL,
  pin        TEXT NOT NULL,
  payment    TEXT NOT NULL,
  items      TEXT NOT NULL,
  status     TEXT NOT NULL DEFAULT 'new',
  created_at INTEGER NOT NULL
);
CREATE INDEX orders_created ON orders (created_at);

CREATE TABLE reset_requests (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  phone      TEXT NOT NULL,
  ip         TEXT,
  created_at INTEGER NOT NULL,
  status     TEXT NOT NULL DEFAULT 'waiting',
  handled_by TEXT,
  handled_at INTEGER
);
CREATE INDEX reset_status ON reset_requests (status, created_at);
CREATE INDEX reset_phone ON reset_requests (phone, created_at);
CREATE INDEX reset_ip ON reset_requests (ip, created_at);

CREATE TABLE settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE audit_log (
  id     INTEGER PRIMARY KEY AUTOINCREMENT,
  who    TEXT NOT NULL,
  action TEXT NOT NULL,
  detail TEXT,
  at     INTEGER NOT NULL
);
CREATE INDEX audit_at ON audit_log (at);
