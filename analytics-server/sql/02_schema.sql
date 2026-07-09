-- Tidy DS Toolbox — usage analytics schema + views + grants (issue #42).
-- Run as a SUPERUSER while connected to the toolbox_logs database:
--     sudo -u postgres psql -p 5432 -d toolbox_logs -f 02_schema.sql

-- --- events table (PRD FR10, amended 2026-07-09) ------------------------------
-- Privacy amendment: no client-identifying columns. `file_hash` is a one-way
-- hash computed in the plugin (schema v2); raw file keys and file names are
-- never stored. Existing installs: apply sql/03_privacy_drop_client_data.sql.
CREATE TABLE IF NOT EXISTS events (
  id              bigint      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  schema_version  integer     NOT NULL,
  type            text        NOT NULL CHECK (type IN ('action', 'module_open')),
  module          text        NOT NULL,
  action          text,
  file_hash       text,
  plugin_version  text,
  session_id      text,
  client_ts       timestamptz,                        -- ordering only (client clock)
  received_at     timestamptz NOT NULL DEFAULT now()  -- FR9: server-set; analyze on this
);

CREATE INDEX IF NOT EXISTS events_received_at_idx        ON events (received_at);
CREATE INDEX IF NOT EXISTS events_module_received_at_idx ON events (module, received_at);

-- --- dashboard views (PRD FR11) ----------------------------------------------
-- Built now so the dashboard slice (#45) is just "point a BI tool at these".
-- All keyed on received_at, never client_ts.

-- Events + distinct sessions per module, per day.
CREATE OR REPLACE VIEW v_module_daily AS
SELECT module,
       date_trunc('day', received_at)      AS day,
       count(*)                            AS events,
       count(DISTINCT session_id)          AS sessions
FROM events
GROUP BY module, date_trunc('day', received_at);

-- Breadth of use: distinct files a module is touched in (hashed identifiers).
CREATE OR REPLACE VIEW v_module_file_breadth AS
SELECT module,
       count(DISTINCT file_hash) AS distinct_files,
       count(*)                  AS events
FROM events
GROUP BY module;

-- The "opened but never actioned" tell.
CREATE OR REPLACE VIEW v_module_opens_vs_actions AS
SELECT module,
       count(*) FILTER (WHERE type = 'module_open') AS opens,
       count(*) FILTER (WHERE type = 'action')      AS actions
FROM events
GROUP BY module;

-- Which actions within a module are actually used.
CREATE OR REPLACE VIEW v_action_breakdown AS
SELECT module,
       action,
       count(*) AS events
FROM events
WHERE type = 'action'
GROUP BY module, action;

-- --- grants (least privilege) ------------------------------------------------
GRANT INSERT ON TABLE events TO toolbox_ingest;
GRANT SELECT ON TABLE events TO toolbox_readonly;
GRANT SELECT ON v_module_daily, v_module_file_breadth,
                v_module_opens_vs_actions, v_action_breakdown
  TO toolbox_readonly;
