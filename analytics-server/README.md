# analytics-server

Usage-analytics ingest service for the Tidy DS Toolbox (issue #42, PRD Phase 2).

A tiny Node/Express service: `POST /events` accepts a JSON array of usage
events, token-gates the request, validates `schemaVersion`, and inserts rows
into Postgres with a **server-set `received_at`**. It binds to `127.0.0.1` only;
nginx terminates TLS and proxies to it. Sending is fire-and-forget on the client
side — this service just needs to accept fast and never be publicly writable.

> **Privacy amendment (2026-07-09):** events are schema **v2 only** — no
> `fileName`, no raw `fileKey`; the single file-scoped field is `fileHash`, a
> one-way hash computed in the plugin. v1 events are rejected. On a box
> deployed before this change, run `sql/03_privacy_drop_client_data.sql` once
> (drops `file_name`, renames `file_key` → `file_hash`, purges stored values)
> and redeploy `server.js`.

## Layout

```
server.js                       the service (~90 lines)
sql/01_roles_and_db.sql         roles + database (run as superuser, on `postgres`)
sql/02_schema.sql               events table, dashboard views, grants (on toolbox_logs)
sql/03_privacy_drop_client_data.sql  one-time migration: drop/purge client-identifying columns
deploy/toolbox-logs.service     systemd unit
deploy/toolbox-logs.env.example env template (copy to /etc/toolbox-logs.env)
deploy/nginx-toolbox-logs.conf  nginx vhost (HTTP; certbot adds TLS)
test/sample-events.json         a 2-event batch for curl testing
```

## Target box (recon, 2026-06)

Ubuntu 24.04 · public IP `204.48.22.123` · **Node v19.9.0** (below package.json
`engines >=20` — `npm ci` only warns, runs fine) · nginx 1.24 + certbot 5.6.0
already fronting the `tidyframework.com` family · two Postgres clusters
(**PG 14 on `5432` primary**, PG 16 on `5433`) · MySQL · ~960 MB RAM total,
~450 MB available + 2 GB swap. Reuse nginx and Postgres; **no Docker**. Free
localhost port chosen: **8091**.

> **As-deployed: 2026-06-25 — live at `https://toolbox-logs.wearekido.dev`.**
> The deploy diverged from the original plan in four ways; each has a note inline
> below (search "⚠️ gotcha"). RAM is tight — Metabase (#45) will need swap headroom.

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

Confirm the primary cluster first: `pg_lsclusters` (here: PG 14 on `5432`).

> **⚠️ gotcha — `sudo -u postgres psql` may demand a password.** This box's
> `pg_hba.conf` singled out the `postgres` user for `md5` (line `local all
> postgres md5`) while everyone else used `peer`, and the password was unknown.
> Fix: switch that one line to `peer` (the Ubuntu default; sudo-gated, scoped to
> the `postgres` user — the apps use TCP/scram and are unaffected):
> ```bash
> sudo cp /etc/postgresql/14/main/pg_hba.conf{,.bak}
> sudo sed -i '/^local\s\+all\s\+postgres\s\+/s/md5/peer/' /etc/postgresql/14/main/pg_hba.conf
> sudo systemctl reload postgresql@14-main
> sudo -u postgres psql -p 5432 -c 'SELECT current_user;'   # no password now
> ```

Pick a real password for each role, then:

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
TOKEN=$(sudo grep -m1 '^INGEST_TOKEN=' /etc/toolbox-logs.env | cut -d= -f2 | tr -d '\r"')

# health
curl -s http://127.0.0.1:8091/health

# ⚠️ gotcha — the env file can contain MORE THAN ONE line matching
# INGEST_TOKEN; a naive `grep | cut` glues two lines together and the embedded
# newline in the Authorization header makes Node's HTTP parser return a bare
# `400 Bad Request` + `Connection: close` BEFORE Express ever runs (journalctl
# shows nothing). Hence the `-m1 '^INGEST_TOKEN='` above. Sanity check:
# `printf %s "$TOKEN" | wc -c` should be 64.

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

Add the DNS A-record first: `toolbox-logs.wearekido.dev → 204.48.22.123`
(Namecheap → wearekido.dev → Advanced DNS → A Record, host `toolbox-logs`).
Verify with `dig +short toolbox-logs.wearekido.dev` before continuing.

**Issue the cert without letting certbot edit nginx** (`certonly`, not the
installer — see the gotcha below). The `--nginx` *authenticator* still answers
the HTTP-01 challenge via the running nginx; it just won't rewrite any vhost:

```bash
sudo certbot certonly --nginx -d toolbox-logs.wearekido.dev
```

Now enable our vhost (which already carries the 443 block + cert paths) and wire
up the explicit include:

```bash
sudo cp /opt/toolbox-logs/deploy/nginx-toolbox-logs.conf /etc/nginx/sites-available/toolbox-logs
sudo ln -s /etc/nginx/sites-available/toolbox-logs /etc/nginx/sites-enabled/toolbox-logs
sudo sed -i '/sites-enabled\/kido-staging;/a\    include /etc/nginx/sites-enabled/toolbox-logs;' /etc/nginx/nginx.conf
sudo nginx -t && sudo systemctl reload nginx
```

Confirm it loaded: `sudo nginx -T 2>/dev/null | grep -c 'server_name toolbox-logs.wearekido.dev'` should be ≥ 2 (the 80 + 443 blocks).

> **⚠️ gotcha — this box does NOT use `include sites-enabled/*`.** `nginx.conf`
> lists each vhost with its own `include` line, so the symlink is **not enough**
> on its own — hence the `sed` that adds the include after the last existing one.

> **⚠️ gotcha — why `certonly`, not plain `certbot --nginx`.** On the live deploy,
> the `--nginx` *installer* injected the toolbox-logs `server` blocks into an
> *unrelated* vhost file (`sites-available/tidyframework.com`) and made the 443
> block a `return 301 https://$host$request_uri` **on the SSL listener itself** —
> an infinite HTTPS→HTTPS redirect loop (`curl` returns 301 with `Location:` = the
> same URL). Issuance succeeded, but routing was broken. `certonly` issues the
> cert and leaves our hand-written vhost to own the domain, avoiding the whole
> mess. If you ever do get bitten: `grep -rln toolbox-logs.wearekido.dev
> /etc/nginx/sites-available/`, delete certbot's injected blocks, reload.

Then end-to-end over the public endpoint (`--json` sets the content-type and
implies POST; keeps the line short):

```bash
TOKEN=$(sudo grep '^INGEST_TOKEN=' /etc/toolbox-logs.env | cut -d= -f2)
curl -s https://toolbox-logs.wearekido.dev/events \
  -H "Authorization: Bearer $TOKEN" --json @/opt/toolbox-logs/test/sample-events.json
```

## Client (#43, shipped)

The plugin transport is implemented and verified end-to-end (events flow
Figma → Postgres). How it works:

- The plugin thread can't do network, so `code.ts` registers a relay
  (`setUsageRelay` in `src/shared/analytics/capture.ts`) that forwards every
  captured `UsageEvent` to the UI thread via `figma.ui.postMessage`.
- The UI thread (`src/shared/analytics/transport.ts`) listens for those messages,
  buffers them in memory, and does a **fire-and-forget batched** `POST /events`
  (#44): one request per batch of up to 10 events, or ~15 s after the first
  event enters an empty buffer, whichever comes first.
  - header `Authorization: Bearer <INGEST_TOKEN>` (same token baked into the build)
  - body: a JSON array of `UsageEvent` (camelCase, see `src/shared/analytics/types.ts`)
  - the buffer is memory-only — events pending at tab close are dropped by design.
  - all events in one batch share the same `received_at` (one INSERT per flush),
    which is also the tell-tale for verifying batching works (see below).
- The send is fully isolated: any failure (server down, offline, non-2xx) is
  swallowed and never blocks, delays, or throws into a user action.

The service ignores the response either way; it returns `{inserted:n}` on 2xx,
`401` if the token is wrong, `400` if the body isn't an array.

### Building the plugin with the token

The endpoint + token are injected at build time by Vite `define` (see
`vite.config.ts`). The token comes from the `TIDY_INGEST_TOKEN` env var and is
**never committed**; a build without it ships an empty token, which disables
sending entirely (safe for ordinary dev builds):

```bash
TIDY_INGEST_TOKEN="$(ssh tidy@204.48.22.123 'sudo grep ^INGEST_TOKEN= /etc/toolbox-logs.env | cut -d= -f2')" npm run build
```

`manifest.json` `networkAccess.allowedDomains` is the single ingest origin
(`https://toolbox-logs.wearekido.dev`); production builds reach nothing else.

## Checking results manually

Until the Metabase dashboard (#45) exists, query Postgres directly from your
laptop (uses the `tidy` SSH alias; `-t` allocates a TTY so `sudo` can prompt):

```bash
# Latest raw events — batched events share an identical received_at
ssh -t tidy 'sudo -u postgres psql -p 5432 -d toolbox_logs \
  -c "SELECT module, action, plugin_version, received_at FROM events ORDER BY received_at DESC LIMIT 20;"'

# Which tools are used, and how often (the headline question)
ssh -t tidy 'sudo -u postgres psql -p 5432 -d toolbox_logs \
  -c "SELECT * FROM v_module_opens_vs_actions ORDER BY actions DESC;"'

# Breadth: how many distinct files each module touches
ssh -t tidy 'sudo -u postgres psql -p 5432 -d toolbox_logs \
  -c "SELECT * FROM v_module_file_breadth;"'

# Top actions per module
ssh -t tidy 'sudo -u postgres psql -p 5432 -d toolbox_logs \
  -c "SELECT * FROM v_action_breakdown LIMIT 25;"'

# Daily usage per module
ssh -t tidy 'sudo -u postgres psql -p 5432 -d toolbox_logs \
  -c "SELECT * FROM v_module_daily ORDER BY day DESC LIMIT 25;"'
```

The dashboard views are defined in `sql/02_schema.sql`. Note `psql` pages long
output through `less` — press `q` to exit the `(END)` prompt.

### CORS

The Figma plugin UI iframe is a cross-origin (`null`-origin) caller and the
`Authorization` header makes `POST /events` a *preflighted* request, so the
service answers `OPTIONS` and sends `Access-Control-Allow-Origin: *` plus the
allowed headers/methods. Without this the browser preflight fails and **no
events arrive** — see the CORS middleware in `server.js`.
