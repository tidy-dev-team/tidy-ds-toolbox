# analytics-server

Usage-analytics ingest service for the Tidy DS Toolbox (issue #42, PRD Phase 2).

A tiny Node/Express service: `POST /events` accepts a JSON array of usage
events, token-gates the request, validates `schemaVersion`, and inserts rows
into Postgres with a **server-set `received_at`**. It binds to `127.0.0.1` only;
nginx terminates TLS and proxies to it. Sending is fire-and-forget on the client
side — this service just needs to accept fast and never be publicly writable.

## Layout

```
server.js                       the service (~90 lines)
sql/01_roles_and_db.sql         roles + database (run as superuser, on `postgres`)
sql/02_schema.sql               events table, dashboard views, grants (on toolbox_logs)
deploy/toolbox-logs.service     systemd unit
deploy/toolbox-logs.env.example env template (copy to /etc/toolbox-logs.env)
deploy/nginx-toolbox-logs.conf  nginx vhost (HTTP; certbot adds TLS)
test/sample-events.json         a 2-event batch for curl testing
```

## Target box (recon, 2026-06)

Ubuntu 24.04 · public IP `204.48.22.123` · Node v22.19.0 · nginx + certbot 5.6.0
already fronting the `tidyframework.com` family · two Postgres clusters
(`5432` primary, `5433`) · MySQL · ~367 MB RAM free + 2 GB swap. Reuse nginx and
Postgres; **no Docker**. Free localhost port chosen: **8091**.

---

## Deploy runbook

### 0. Get the code onto the droplet

From your laptop (which has this repo and SSH access):

```bash
rsync -av --exclude node_modules analytics-server/ tidy@204.48.22.123:/opt/toolbox-logs/
```

(Or `scp -r`. `/opt/toolbox-logs` should be owned by `tidy`:
`sudo mkdir -p /opt/toolbox-logs && sudo chown tidy:tidy /opt/toolbox-logs`.)

### 1. Install deps (on the droplet)

```bash
cd /opt/toolbox-logs
npm ci --omit=dev   # or: npm install --omit=dev
```

### 2. Database

Confirm the primary cluster first: `pg_lsclusters`. Pick a real password for
each role, then:

```bash
sudo -u postgres psql -p 5432 -f /opt/toolbox-logs/sql/01_roles_and_db.sql
sudo -u postgres psql -p 5432 -d toolbox_logs -f /opt/toolbox-logs/sql/02_schema.sql
```

If you left the CHANGE_ME passwords in the SQL, set them now:

```bash
sudo -u postgres psql -p 5432 -c "ALTER ROLE toolbox_ingest   PASSWORD '...';"
sudo -u postgres psql -p 5432 -c "ALTER ROLE toolbox_readonly PASSWORD '...';"
```

### 3. Environment file

```bash
sudo cp /opt/toolbox-logs/deploy/toolbox-logs.env.example /etc/toolbox-logs.env
sudo nano /etc/toolbox-logs.env     # set INGEST_TOKEN (openssl rand -hex 32) + the ingest password in DATABASE_URL
sudo chown root:root /etc/toolbox-logs.env
sudo chmod 600 /etc/toolbox-logs.env
```

### 4. systemd service

```bash
which node     # put this absolute path in ExecStart if it isn't /usr/bin/node
sudo cp /opt/toolbox-logs/deploy/toolbox-logs.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now toolbox-logs
systemctl status toolbox-logs --no-pager
```

### 5. Local verification (no domain needed — covers 4 of 5 acceptance criteria)

```bash
TOKEN=$(sudo grep INGEST_TOKEN /etc/toolbox-logs.env | cut -d= -f2)

# health
curl -s http://127.0.0.1:8091/health

# rejected without token  -> 401
curl -s -o /dev/null -w '%{http_code}\n' -X POST http://127.0.0.1:8091/events \
  -H 'Content-Type: application/json' --data @/opt/toolbox-logs/test/sample-events.json

# accepted with token     -> {"inserted":2}
curl -s -X POST http://127.0.0.1:8091/events \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  --data @/opt/toolbox-logs/test/sample-events.json

# rows landed, received_at server-set
sudo -u postgres psql -p 5432 -d toolbox_logs \
  -c "SELECT module, type, received_at FROM events ORDER BY received_at;"
```

### 6. nginx + TLS (needs DNS — the last acceptance criterion)

Once `toolbox-logs.wearekido.dev` A-record → `204.48.22.123` resolves:

```bash
sudo cp /opt/toolbox-logs/deploy/nginx-toolbox-logs.conf \
  /etc/nginx/sites-available/toolbox-logs.wearekido.dev
sudo ln -s /etc/nginx/sites-available/toolbox-logs.wearekido.dev /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d toolbox-logs.wearekido.dev   # adds the 443 block + redirect
```

Then end-to-end:

```bash
curl -s -X POST https://toolbox-logs.wearekido.dev/events \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  --data @/opt/toolbox-logs/test/sample-events.json
```

## Client contract (for #43)

The plugin UI thread sends `POST /events` with:
- header `Authorization: Bearer <INGEST_TOKEN>` (same token baked into the build)
- body: a JSON array of `UsageEvent` (camelCase, see `src/shared/analytics/types.ts`)

The service ignores the response (fire-and-forget); it returns `{inserted:n}` on
2xx, `401` if the token is wrong, `400` if the body isn't an array.
