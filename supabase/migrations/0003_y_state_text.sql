-- Change `scripts.y_state` from bytea to text.
--
-- Supabase-JS returns bytea columns as `\x<hex>` strings (not Uint8Array),
-- which is awkward to decode on the client. Storing the Yjs snapshot as
-- base64 in a `text` column keeps the wire format simple and avoids
-- driver-specific quirks.

alter table public.scripts
  drop column if exists y_state;

alter table public.scripts
  add column y_state text; -- base64-encoded Y.encodeStateAsUpdate(doc)
