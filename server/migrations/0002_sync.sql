-- Sync between your devices (F12). The server stores only ciphertext: each item is a record
-- (or a meeting with everything under it) encrypted on the device with a key from the sync
-- passphrase, which never reaches the server. Keys are HMACs, so not even ids are visible.

-- One sync space per server: the PBKDF2 salt and an encrypted check value, so a second
-- device can tell a wrong passphrase from a right one without the server knowing either.
create table sync_space (
  id          integer primary key check (id = 1),
  salt        text not null,
  verifier    text not null,
  created_at  integer not null
);

-- Latest version of each item. seq goes up on every write, so a device asks for "everything
-- after the last seq I saw". Deletions stay as tombstones (deleted = 1, no data).
create table sync_items (
  key         text primary key,
  seq         integer not null unique,
  iv          text,
  data        text,
  deleted     integer not null default 0 check (deleted in (0, 1)),
  device_id   text,
  updated_at  integer not null
);
