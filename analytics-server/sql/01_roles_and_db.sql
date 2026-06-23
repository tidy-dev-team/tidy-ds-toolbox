-- Tidy DS Toolbox — usage analytics, cluster-level setup (issue #42).
-- Run as a SUPERUSER while connected to the default `postgres` database:
--     sudo -u postgres psql -p 5432 -f 01_roles_and_db.sql
--
-- Replace the two CHANGE_ME passwords first (or set them afterwards with
-- ALTER ROLE ... PASSWORD '...'). Keep the real passwords out of git.

-- Ingest service role: append-only (INSERT granted in 02_schema.sql).
CREATE ROLE toolbox_ingest LOGIN PASSWORD 'CHANGE_ME_INGEST';

-- Dashboard role: read-only, used over the SSH tunnel from a laptop (#45).
CREATE ROLE toolbox_readonly LOGIN PASSWORD 'CHANGE_ME_READONLY';

CREATE DATABASE toolbox_logs;

GRANT CONNECT ON DATABASE toolbox_logs TO toolbox_ingest, toolbox_readonly;
