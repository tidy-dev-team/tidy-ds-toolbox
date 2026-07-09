-- Tidy DS Toolbox — privacy amendment (2026-07-09): stop storing, and purge,
-- all client-identifying data. Run once on installs created from the original
-- 02_schema.sql, as a SUPERUSER on the toolbox_logs database:
--     sudo -u postgres psql -p 5432 -d toolbox_logs -f 03_privacy_drop_client_data.sql
--
-- After this migration only schema-v2 events (which carry a client-side
-- one-way `fileHash`) are stored; the ingest service rejects v1 events.
-- Deploy the updated server.js together with this migration.

BEGIN;

-- Drop the file name entirely — it could contain client/project names.
ALTER TABLE events DROP COLUMN IF EXISTS file_name;

-- The raw file_key identified (and could locate) client files. Rename the
-- column for the hashed v2 identifier and purge every stored raw value —
-- old rows keep their module/action data but lose file identity.
ALTER TABLE events RENAME COLUMN file_key TO file_hash;
UPDATE events SET file_hash = NULL;

-- Recreate the breadth view on the renamed column (rename updates the view
-- body automatically; recreate for a clean definition).
CREATE OR REPLACE VIEW v_module_file_breadth AS
SELECT module,
       count(DISTINCT file_hash) AS distinct_files,
       count(*)                  AS events
FROM events
GROUP BY module;

COMMIT;
