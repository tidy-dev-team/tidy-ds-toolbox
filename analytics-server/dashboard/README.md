# Metabase Dashboard: Local Operator Guide

View usage analytics for the Tidy DS Toolbox via Metabase running on your laptop.

---

## Architecture

- **Metabase** runs as a local Docker container on your machine.
- It connects to the **production Postgres** database on the droplet (`204.48.22.123`, PG 14 on port 5432).
- The connection uses a **loopback SSH tunnel** (`127.0.0.1:15432` -> `localhost:5432` over SSH).
  This is the only access path -- no new open ports, no `pg_hba` changes on the droplet.
- Metabase state (saved questions, dashboards, connection settings) persists in a named Docker volume `metabase-data`.
- No credentials are committed to git.
  The readonly password is set via SQL and stored only in Metabase's volume.

---

## Prerequisites

- **Docker Desktop** installed and running on your laptop.
- **Repository access** to this repo (you already have it).
- **SSH alias `tidy`** configured in `~/.ssh/config`, pointing at `tidy@204.48.22.123`.
  The `dashboard:tunnel` npm script uses it: `ssh -N -L 127.0.0.1:15432:localhost:5432 tidy`.

---

## One-time Setup: Reset the `toolbox_readonly` Password

The password was lost at some point.
Reset it once via SQL on the droplet.
Run this from your laptop:

```bash
ssh tidy 'sudo -u postgres psql -p 5432 -c "ALTER ROLE toolbox_readonly PASSWORD '\''<choose-a-safe-password-here>'\'';"'
```

**Keep this password out of git.**
You will enter it once in the Metabase UI on the "Add database" screen.

---

## Startup (two terminals)

### Terminal 1: SSH tunnel

```bash
npm run dashboard:tunnel
```

This runs `ssh -N -L 127.0.0.1:15432:localhost:5432 tidy`.
It holds the tunnel open until you press Ctrl-C.
Leave it running in the background while you use the dashboard.

### Terminal 2: Metabase container

```bash
npm run dashboard:up
```

This runs `docker compose -f analytics-server/dashboard/docker-compose.yml up -d`.
First run pulls the `metabase/metabase` image (~500 MB).

Open `http://127.0.0.1:3000` in your browser.

---

## Metabase Setup (first visit)

1. Complete the one-time admin account creation (local only, any values).
2. Go to **Settings > Admin > Databases > Add database**.
3. Choose **PostgreSQL** and enter these exact values:

| Field         | Value                 |
|---------------|-----------------------|
| Display name  | `toolbox_logs`        |
| Host          | `host.docker.internal`|
| Port          | `15432`               |
| Database name | `toolbox_logs`        |
| Username      | `toolbox_readonly`    |
| Password      | (the password you set)|

The `host.docker.internal` hostname resolves from inside the container to your host machine, where the SSH tunnel is listening on `127.0.0.1:15432`.

4. Click **Save**.
   Metabase tests the connection.
   If it fails, see [Troubleshooting](#troubleshooting) below.

---

## The Four Dashboard Cards

Create each card as a **SQL question** in Metabase, then add it to a dashboard named **Tidy DS Toolbox**.

### 1. Module Daily Usage: `v_module_daily`

**SQL:**
```sql
SELECT
  day,
  module,
  events,
  sessions
FROM v_module_daily
ORDER BY day DESC;
```

**Visualization:** Bar or line chart.
**X-axis:** `day`.
**Y-axis:** `events` and `sessions`.
**Series (group/color):** `module`.
**Order:** `day` descending.

### 2. File Breadth: `v_module_file_breadth`

**SQL:**
```sql
SELECT
  module,
  distinct_files,
  events
FROM v_module_file_breadth
ORDER BY distinct_files DESC;
```

**Visualization:** Bar chart (or table).
**X-axis:** `module`.
**Y-axis:** `distinct_files`.
**Order:** `distinct_files` descending.

### 3. Opens vs Actions: `v_module_opens_vs_actions`

**SQL:**
```sql
SELECT
  module,
  opens,
  actions
FROM v_module_opens_vs_actions
ORDER BY actions DESC;
```

**Visualization:** Bar chart with `opens` and `actions` as stacked or side-by-side bars.
**Category (axis):** `module`.
**Values:** `opens` and `actions`.
**Order:** `actions` descending.

### 4. Action Breakdown: `v_action_breakdown`

**SQL:**
```sql
SELECT
  module,
  action,
  events
FROM v_action_breakdown
ORDER BY events DESC;
```

**Visualization:** Table.
**Order:** `events` descending.

### Saving cards to the dashboard

1. Run a query in the **SQL query editor**.
2. Click **Save** and give the card a descriptive name (e.g. "Module Daily Usage").
3. Click **Add to dashboard**.
4. Select (or create) a dashboard named **Tidy DS Toolbox**.

---

## Routine Future Startup

Once everything is set up, each session is just:

```
Terminal 1:  npm run dashboard:tunnel   (let it run)
Terminal 2:  npm run dashboard:up       (if container isn't already running)
Browser:     http://127.0.0.1:3000
```

Metabase remembers the database connection and all saved cards/dashboards because its state lives in the `metabase-data` Docker volume.

---

## Shutdown

```bash
npm run dashboard:down
```

This stops the Metabase container (data in the volume is preserved).
Then press Ctrl-C in the tunnel terminal to close the SSH tunnel.

---

## Troubleshooting

### Tunnel won't open

- Confirm the `tidy` SSH alias works: `ssh tidy 'echo ok'`.
- Check that nothing is already on port 15432: `lsof -i :15432`.
- If port 15432 is taken, kill the old tunnel or choose a different local port and update the command.

### Metabase container doesn't start

- Check Docker Desktop is running.
- Check logs: `docker compose -f analytics-server/dashboard/docker-compose.yml logs`.
- First pull of the `metabase/metabase` image can take a minute.

### Database connection test fails in Metabase UI

All four checks, in order:

1. **Tunnel is open** -- run `lsof -i :15432`.
   You should see `ssh` in LISTEN.
   If not, start the tunnel.

2. **Droplet Postgres is running** -- `ssh tidy 'sudo systemctl status postgresql@14-main'`.

3. **Password is correct** -- run the one-time reset command again from the [One-time Setup](#one-time-setup-reset-the-toolbox_readonly-password) section.
   Then retry the connection test in Metabase.

4. **`host.docker.internal` resolves inside the container** -- on Docker Desktop for macOS and Windows this always works.
   On Linux, you may need `--add-host=host.docker.internal:host-gateway` in the Docker Compose file.

### Empty data or "No results"

- Data exists only if the plugin was used by a build that included a real ingest token.
  Ordinary dev builds don't send events.
- Verify with a direct query against the droplet (password not needed):
  ```bash
  ssh -t tidy 'sudo -u postgres psql -p 5432 -d toolbox_logs -c "SELECT count(*) FROM events;"'
  ```
- If the count is zero, no events have been captured yet.
  Use the plugin in a TIDY_INGEST_TOKEN build and trigger some actions.
