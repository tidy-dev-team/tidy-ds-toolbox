// Usage event capture for the plugin thread.
// See docs/prd-usage-analytics-phase1.md (FR1–FR9) and docs/usage-analytics-plan.md.
//
// One capture hook in src/code.ts calls `captureUsage` for every well-formed
// UI→plugin message. `classifyMessage` decides whether the message becomes an
// `action` event, a `module_open` event, or is dropped as noise (FR2, FR4, FR5).
// `buildEvent` attaches figma context + sessionId + pluginVersion (FR3, FR7).
// The whole path is wrapped so a failure can never affect a user action (FR9).

import { appendUsageEvent } from "./buffer";
import type { EventIdentity, UsageEvent } from "./types";

// The incoming message shape, as destructured in code.ts.
export interface IncomingMessage {
  target: string;
  action: string;
  payload?: unknown;
}

// Figma context needed to build an event. Passed in from code.ts so the
// builder is testable without the figma global.
export interface FigmaContext {
  fileKey: string | null;
  rootId: string;
  rootName: string;
}

let analyticsSessionId: string | null = null;

// Minted once per plugin open; reused on every event. Lazy on first capture
// so a session with no user actions allocates nothing. Minted on the plugin
// thread (where figma context lives) rather than the UI thread to avoid a
// round-trip — satisfies FR7's "once per plugin open, on every event" intent.
export function initAnalyticsSession(): string {
  if (!analyticsSessionId) {
    const nonce = Math.random().toString(36).slice(2, 10);
    analyticsSessionId = `anon_${Date.now().toString(36)}_${nonce}`;
  }
  return analyticsSessionId;
}

export function getAnalyticsSessionId(): string | null {
  return analyticsSessionId;
}

// Test-only: reset the session between tests.
export function resetAnalyticsSession(): void {
  analyticsSessionId = null;
}

// Classify an incoming message into an event identity, or null to drop.
// Reads `payload.key` only to distinguish the activeModule write from other
// shell storage traffic — never copies payload contents into an event (FR6).
export function classifyMessage(msg: IncomingMessage): EventIdentity | null {
  // FR4: mcp-bridge is agent-driven, not user-driven.
  if (msg.target === "mcp-bridge") {
    return null;
  }

  if (msg.target === "shell") {
    // FR2/FR4: the activeModule save-storage write is a genuine user switch.
    if (msg.action === "save-storage") {
      const p = msg.payload as { key?: string; value?: unknown } | undefined;
      if (p?.key === "activeModule") {
        return { type: "module_open", module: String(p.value), action: null };
      }
    }
    // FR5: load-storage (including the startup activeModule restore) and all
    // other shell housekeeping (save-storage for other keys, resize-ui) is noise.
    return null;
  }

  // Everything else — the 10 user-facing modules' actions.
  return { type: "action", module: msg.target, action: msg.action };
}

export function buildEvent(
  identity: EventIdentity,
  ctx: FigmaContext,
  sessionId: string,
  pluginVersion: string,
  now: Date = new Date(),
): UsageEvent {
  return {
    schemaVersion: 1,
    type: identity.type,
    module: identity.module,
    action: identity.action,
    fileKey: ctx.fileKey ?? ctx.rootId,
    fileName: ctx.rootName,
    pluginVersion,
    sessionId,
    clientTs: now.toISOString(),
  };
}

// FR8: emit a structured event to the console (clearly tagged) and the ring buffer.
export function emitUsageEvent(event: UsageEvent): void {
  // eslint-disable-next-line no-console
  console.log("[usage]", JSON.stringify(event));
  appendUsageEvent(event);
}

// Single entry point from code.ts. Never throws (FR9).
export function captureUsage(
  msg: IncomingMessage,
  ctx: FigmaContext,
  pluginVersion: string,
): void {
  try {
    const identity = classifyMessage(msg);
    if (!identity) {
      return;
    }
    const sessionId = initAnalyticsSession();
    const event = buildEvent(identity, ctx, sessionId, pluginVersion);
    emitUsageEvent(event);
  } catch {
    // FR9: swallow silently — instrumentation must never affect a user action.
  }
}
