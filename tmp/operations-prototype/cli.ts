// PROTOTYPE — throwaway TUI. Drive operations by keystroke; render full frame.
// Run: npm run prototype:operations  (or: node tmp/operations-prototype/cli.ts)

import { stdin, stdout } from "node:process";
import {
  bindSession,
  dispatch,
  newSession,
  OPERATIONS,
  switchFile,
} from "./operations.ts";
import type { Session } from "./operations.ts";
import type { BridgeRequest, BridgeResponse } from "./types.ts";

const BOLD = "\x1b[1m";
const DIM = "\x1b[2m";
const RED = "\x1b[31m";
const GRN = "\x1b[32m";
const CYN = "\x1b[36m";
const YEL = "\x1b[33m";
const RESET = "\x1b[0m";

interface Frame {
  session: Session;
  lastIds: string[];
  exchanges: { req: BridgeRequest; res: BridgeResponse }[];
  message: string;
}

const state: Frame = {
  session: newSession(),
  lastIds: [],
  exchanges: [],
  message: "Welcome — press a key. Last-found ids feed key [3].",
};
bindSession(state.session);

function reset(): void {
  state.session = newSession();
  bindSession(state.session);
  state.lastIds = [];
  state.exchanges = [];
  state.message = "Session reset.";
}

let reqCounter = 0;
function nextReqId(): string { return "req_" + (++reqCounter).toString().padStart(3, "0"); }

async function call(operation: string, params: unknown): Promise<void> {
  const req: BridgeRequest = { id: nextReqId(), operation, params };
  const res = await dispatch(req);
  state.exchanges.push({ req, res });
  if (state.exchanges.length > 5) state.exchanges.shift();
  if (res.ok && operation === "misprint.find-components") {
    state.lastIds = (res.result as { ids: string[] }).ids;
  }
  state.message = res.ok
    ? `${GRN}✓${RESET} ${operation} → ok`
    : `${RED}✗${RESET} ${operation} → ${res.error.code}`;
}

// ─── Render ─────────────────────────────────────────────────────────────────

function render(): void {
  stdout.write("\x1b[2J\x1b[H");
  const s = state.session;
  out(`${BOLD}Tidy DS Toolbox — Operations prototype${RESET}  ${DIM}(throwaway)${RESET}`);
  out("");
  out(`${BOLD}Session${RESET}  ${s.active ? GRN + "active" : RED + "ended"}${RESET}  ${DIM}file=${s.fileKey} sid=${s.sessionId}${RESET}`);
  out("");
  out(`${BOLD}File${RESET}`);
  out(`  ${DIM}pages:${RESET}`);
  for (const p of s.file.pages) out(`    ${DIM}${p.id}${RESET}  ${p.name}`);
  out(`  ${DIM}nodes:${RESET}`);
  for (const n of s.file.nodes) {
    const desc = n.description ? ` ${DIM}desc:${RESET} ${truncate(n.description.replace(/\n/g, " ⏎ "), 50)}` : "";
    out(`    ${DIM}${n.id}${RESET}  ${pad(n.type, 14)}  ${n.name}${desc}`);
  }
  out("");
  out(`${BOLD}Last find-components ids${RESET}  ${state.lastIds.length ? state.lastIds.join(", ") : DIM + "(none)" + RESET}`);
  out("");
  out(`${BOLD}Bridge log${RESET}  ${DIM}(last 5)${RESET}`);
  if (state.exchanges.length === 0) out(`  ${DIM}(empty)${RESET}`);
  for (const ex of state.exchanges) {
    out(`  ${CYN}→${RESET} ${ex.req.id} ${BOLD}${ex.req.operation}${RESET} ${DIM}${json(ex.req.params)}${RESET}`);
    if (ex.res.ok) {
      out(`  ${GRN}←${RESET} ${ex.res.id} ${GRN}ok${RESET}   ${DIM}${json(ex.res.result)}${RESET}`);
    } else {
      out(`  ${RED}←${RESET} ${ex.res.id} ${RED}${ex.res.error.code}${RESET} ${ex.res.error.message} ${DIM}${json(ex.res.error.details ?? {})}${RESET}`);
    }
  }
  out("");
  out(`${BOLD}${state.message}${RESET}`);
  out("");
  out(`${BOLD}Keys${RESET}`);
  out(`  ${BOLD}1${RESET} ${DIM}find-components scope=file${RESET}`);
  out(`  ${BOLD}2${RESET} ${DIM}find-components scope=page page1 pattern=Btn*${RESET}`);
  out(`  ${BOLD}3${RESET} ${DIM}apply-misprint on last-found ids${RESET}`);
  out(`  ${BOLD}4${RESET} ${DIM}apply-misprint on bogus id (→ NOT_FOUND)${RESET}`);
  out(`  ${BOLD}5${RESET} ${DIM}apply-misprint on mixed valid + frame (→ WRONG_NODE_TYPE)${RESET}`);
  out(`  ${BOLD}6${RESET} ${DIM}ds-template.run${RESET}`);
  out(`  ${BOLD}7${RESET} ${DIM}ds-template.run again (duplicates pages — by design)${RESET}`);
  out(`  ${BOLD}p${RESET} ${DIM}find-components scope=page (no pageId — INVALID_PARAMS)${RESET}`);
  out(`  ${BOLD}u${RESET} ${DIM}call unknown operation (→ UNSUPPORTED_OPERATION)${RESET}`);
  out(`  ${BOLD}s${RESET} ${DIM}simulate file switch (subsequent calls → FILE_SWITCHED)${RESET}`);
  out(`  ${BOLD}r${RESET} ${DIM}reset session${RESET}`);
  out(`  ${BOLD}l${RESET} ${DIM}list registered operations${RESET}`);
  out(`  ${BOLD}q${RESET} ${DIM}quit${RESET}`);
}

function out(line: string): void { stdout.write(line + "\n"); }
function pad(s: string, n: number): string { return s + " ".repeat(Math.max(0, n - s.length)); }
function truncate(s: string, n: number): string { return s.length > n ? s.slice(0, n - 1) + "…" : s; }
function json(v: unknown): string {
  try { return JSON.stringify(v); } catch { return String(v); }
}

// ─── Input ──────────────────────────────────────────────────────────────────

async function handle(key: string): Promise<void> {
  switch (key) {
    case "1": await call("misprint.find-components", { scope: "file" }); break;
    case "2": await call("misprint.find-components", { scope: "page", pageId: "page1", namePattern: "Btn*" }); break;
    case "3":
      if (state.lastIds.length === 0) { state.message = `${YEL}!${RESET} run [1] or [2] first to populate last-found ids`; break; }
      await call("misprint.apply", { nodeIds: state.lastIds });
      break;
    case "4": await call("misprint.apply", { nodeIds: ["n1", "n_does_not_exist"] }); break;
    case "5": await call("misprint.apply", { nodeIds: ["n1", "n5"] }); break;
    case "6": await call("ds-template.run", {}); break;
    case "7": await call("ds-template.run", {}); break;
    case "p": await call("misprint.find-components", { scope: "page" }); break;
    case "u": await call("nonexistent.op", {}); break;
    case "s":
      switchFile(state.session);
      state.message = `${YEL}!${RESET} file switched — session marked inactive`;
      break;
    case "r": reset(); break;
    case "l":
      state.message = "Registered: " + OPERATIONS.map(o => `${o.spec.id}[${o.spec.kind}]`).join("  ");
      break;
    case "q":
    case "": // ctrl-c
      stdout.write("\nbye\n");
      process.exit(0);
  }
  render();
}

stdin.setRawMode?.(true);
stdin.resume();
stdin.setEncoding("utf8");
stdin.on("data", async (chunk: string) => {
  for (const ch of chunk) {
    await handle(ch);
  }
});

render();
