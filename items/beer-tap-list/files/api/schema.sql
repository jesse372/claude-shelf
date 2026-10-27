-- Accounts and per-brewery boards.
--
-- Deliberately separate from the board that already runs in a shed on a Fire Stick.
-- That one reads a static file from GitHub Pages and must keep working forever, for
-- free, whatever happens here.

CREATE TABLE IF NOT EXISTS users (
  id          TEXT PRIMARY KEY,
  email       TEXT NOT NULL UNIQUE,   -- always stored lowercased and trimmed
  pw_salt     TEXT NOT NULL,
  pw_hash     TEXT NOT NULL,
  created     INTEGER NOT NULL,
  last_login  INTEGER
);

CREATE TABLE IF NOT EXISTS breweries (
  id       TEXT PRIMARY KEY,
  -- The board's public address. Long and random rather than secret: a Fire Stick can
  -- never be logged out of a URL, and the board stays a cacheable static read.
  slug     TEXT NOT NULL UNIQUE,
  name     TEXT NOT NULL,
  plan     TEXT NOT NULL DEFAULT 'trial',
  created  INTEGER NOT NULL
);

-- Many-to-many from the start, so "invite your staff" later is a row rather than a
-- migration. One person can also run two venues.
CREATE TABLE IF NOT EXISTS members (
  user_id    TEXT NOT NULL,
  brewery_id TEXT NOT NULL,
  role       TEXT NOT NULL DEFAULT 'owner',   -- owner | staff
  created    INTEGER NOT NULL,
  PRIMARY KEY (user_id, brewery_id)
);
CREATE INDEX IF NOT EXISTS members_by_brewery ON members (brewery_id);

-- The tap list itself, one document per brewery. Kept whole rather than split into
-- tables: the board wants it as one JSON read, and shredding it would buy nothing.
CREATE TABLE IF NOT EXISTS boards (
  brewery_id TEXT PRIMARY KEY,
  data       TEXT NOT NULL,
  updated    TEXT NOT NULL,               -- ISO stamp, the same version marker the editor uses
  rev        INTEGER NOT NULL DEFAULT 1   -- bumped on every write, for conflict detection
);

-- Only a hash of the token is stored, so a leaked database cannot be used to sign in.
CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL,
  created    INTEGER NOT NULL,
  expires    INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS sessions_by_user ON sessions (user_id);
CREATE INDEX IF NOT EXISTS sessions_by_expiry ON sessions (expires);

-- Failed sign-ins, so guessing can be slowed without needing anything stateful.
CREATE TABLE IF NOT EXISTS login_attempts (
  key      TEXT PRIMARY KEY,   -- email (lowercased)
  fails    INTEGER NOT NULL DEFAULT 0,
  last     INTEGER NOT NULL
);

-- Staff invitations. Only a hash of the token is stored, same reasoning as sessions:
-- a leaked database should not hand anybody a way in.
CREATE TABLE IF NOT EXISTS invites (
  token_hash TEXT PRIMARY KEY,
  brewery_id TEXT NOT NULL,
  email      TEXT NOT NULL,          -- who it was sent to, lowercased
  role       TEXT NOT NULL DEFAULT 'staff',
  invited_by TEXT NOT NULL,
  created    INTEGER NOT NULL,
  expires    INTEGER NOT NULL,
  accepted   INTEGER                 -- when it was used; NULL while pending
);
CREATE INDEX IF NOT EXISTS invites_by_brewery ON invites (brewery_id);
CREATE INDEX IF NOT EXISTS invites_by_email ON invites (email);

-- Password resets. Single use, short lived, and only a hash is stored.
CREATE TABLE IF NOT EXISTS resets (
  token_hash TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL,
  created    INTEGER NOT NULL,
  expires    INTEGER NOT NULL,
  used       INTEGER
);
CREATE INDEX IF NOT EXISTS resets_by_user ON resets (user_id);

-- Billing lives beside the brewery it pays for, so a lapsed subscription is a plan
-- change and not a special case elsewhere.
ALTER TABLE breweries ADD COLUMN stripe_customer TEXT;
ALTER TABLE breweries ADD COLUMN stripe_subscription TEXT;
ALTER TABLE breweries ADD COLUMN sub_status TEXT;      -- active | past_due | canceled | trialing
ALTER TABLE breweries ADD COLUMN sub_until INTEGER;    -- paid up to, so grace is possible
