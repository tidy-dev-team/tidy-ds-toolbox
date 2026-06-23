// Tidy DS Toolbox — usage-analytics ingest service (issue #42, PRD FR8/FR9).
//
// Accepts batched usage events from the Figma plugin's UI thread and inserts
// them into Postgres with a server-set `received_at`. Token-gated and bound to
// 127.0.0.1 only — public exposure and TLS are handled by nginx in front of it.
//
// Event JSON keys are the camelCase `UsageEvent` shape from
// src/shared/analytics/types.ts; columns are snake_case (PRD FR10).

import express from "express";
import pg from "pg";
import { timingSafeEqual } from "node:crypto";

const PORT = Number(process.env.PORT ?? 8091);
const HOST = "127.0.0.1"; // never 0.0.0.0 — reachable only via nginx
const TOKEN = process.env.INGEST_TOKEN;
const DATABASE_URL = process.env.DATABASE_URL;
const MAX_BATCH = 1000; // hard cap per request, defence-in-depth

if (!TOKEN) {
  console.error("[ingest] INGEST_TOKEN is not set — refusing to start.");
  process.exit(1);
}
if (!DATABASE_URL) {
  console.error("[ingest] DATABASE_URL is not set — refusing to start.");
  process.exit(1);
}

const pool = new pg.Pool({ connectionString: DATABASE_URL, max: 4 });
pool.on("error", (err) => {
  // A pooled connection dropped while idle — log, never crash (FR4 spirit).
  console.error("[ingest] idle pg client error:", err.message);
});

// Constant-time bearer-token check (avoids leaking the token via timing).
const tokenBuf = Buffer.from(TOKEN);
function authorized(req) {
  const header = req.get("authorization") ?? "";
  const m = header.match(/^Bearer\s+(.+)$/i);
  if (!m) return false;
  const presented = Buffer.from(m[1]);
  if (presented.length !== tokenBuf.length) return false;
  return timingSafeEqual(presented, tokenBuf);
}

const KNOWN_TYPES = new Set(["action", "module_open"]);
const COLS = 9;

// Map one raw client event to a column tuple, or null to drop it.
// FR8: validate schemaVersion. We are lenient on optional fields (a malformed
// optional must not sink an otherwise-valid event — the client never retries).
function normalize(e) {
  if (!e || typeof e !== "object") return null;
  if (e.schemaVersion !== 1) return null;
  if (!KNOWN_TYPES.has(e.type)) return null;
  if (typeof e.module !== "string" || e.module.length === 0) return null;
  const str = (v) => (typeof v === "string" ? v : null);
  return [
    1, // schema_version
    e.type,
    e.module,
    str(e.action),
    str(e.fileKey),
    str(e.fileName),
    str(e.pluginVersion),
    str(e.sessionId),
    str(e.clientTs),
  ];
}

const app = express();
app.disable("x-powered-by");
app.use(express.json({ limit: "1mb" }));

// Unauthenticated liveness probe for nginx / manual checks. Reveals nothing.
app.get("/health", (_req, res) => res.json({ ok: true }));

app.post("/events", async (req, res) => {
  if (!authorized(req)) {
    return res.status(401).json({ error: "unauthorized" });
  }
  const body = req.body;
  if (!Array.isArray(body)) {
    return res.status(400).json({ error: "expected a JSON array of events" });
  }

  const rows = body.slice(0, MAX_BATCH).map(normalize).filter(Boolean);
  if (rows.length === 0) {
    return res.status(200).json({ inserted: 0 }); // accepted, nothing valid
  }

  // One multi-row parameterized INSERT. `received_at` defaults to now() in the
  // table (FR9) — it is never taken from the client.
  const valuesSql = rows
    .map((_, i) => {
      const base = i * COLS;
      const ph = Array.from({ length: COLS }, (_, j) => `$${base + j + 1}`);
      return `(${ph.join(",")})`;
    })
    .join(",");
  const sql = `INSERT INTO events
    (schema_version, type, module, action, file_key, file_name, plugin_version, session_id, client_ts)
    VALUES ${valuesSql}`;

  try {
    await pool.query(sql, rows.flat());
    return res.status(200).json({ inserted: rows.length });
  } catch (err) {
    console.error("[ingest] insert failed:", err.message);
    return res.status(500).json({ error: "insert failed" });
  }
});

const server = app.listen(PORT, HOST, () => {
  console.log(`[ingest] listening on http://${HOST}:${PORT}`);
});

// Graceful shutdown so systemd restarts/stops are clean.
for (const sig of ["SIGTERM", "SIGINT"]) {
  process.on(sig, () => {
    server.close(() => pool.end().finally(() => process.exit(0)));
  });
}
