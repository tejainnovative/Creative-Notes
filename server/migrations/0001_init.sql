-- Creative Notes: server schema (Cloudflare D1 / SQLite)
-- Plumbing only. No meeting content is ever stored here, except inbox_items,
-- which hold a quick note for at most 24 hours until the device picks it up.
-- Ids: UUIDv7 text generated in the Worker. Times: integer epoch ms, UTC.

pragma foreign_keys = on;

-- Paired devices and Siri/Shortcut tokens. Only the SHA-256 of a token is stored.
create table devices (
  id            text primary key,
  label         text not null check (length(label) between 1 and 60),
  token_hash    text not null unique,
  scope         text not null default 'full'
                  check (scope in ('full', 'inbox:write')),
  created_at    integer not null,
  updated_at    integer not null,
  last_seen_at  integer,
  revoked_at    integer
);
create index devices_active on devices (revoked_at);

-- Siri / Shortcut fallback inbox (F09). Text is AES-GCM encrypted by the Worker
-- with a key from a Worker secret, deleted on ack, and purged after 24 h by cron.
create table inbox_items (
  id                text primary key,
  device_id         text not null references devices(id) on delete cascade,
  text_enc          blob not null,
  iv                blob not null,
  created_at        integer not null,
  updated_at        integer not null
);
create index inbox_by_device on inbox_items (device_id);
create index inbox_by_age    on inbox_items (created_at);

-- Token-bucket rate limiting, one row per device and route group.
create table rate_buckets (
  device_id     text not null references devices(id) on delete cascade,
  route_group   text not null check (route_group in ('ai', 'stt', 'inbox', 'pair')),
  tokens        real not null,
  refilled_at   integer not null,
  primary key (device_id, route_group)
);

-- Daily usage per device, to cap spend. No content, only counts.
create table usage_daily (
  device_id      text not null references devices(id) on delete cascade,
  day            text not null check (day glob '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),  -- UTC date
  ai_input_tokens  integer not null default 0,
  ai_output_tokens integer not null default 0,
  stt_seconds      integer not null default 0,
  requests         integer not null default 0,
  primary key (device_id, day)
);
create index usage_by_day on usage_daily (day);

-- /api/pair brute-force guard, keyed by a hash of the client IP.
create table pair_attempts (
  ip_hash       text not null,
  attempted_at  integer not null
);
create index pair_attempts_by_ip on pair_attempts (ip_hash, attempted_at);
