// Schema v2 usage event shape, captured in the plugin thread.
// See docs/prd-usage-analytics-phase1.md (FR3) and docs/usage-analytics-plan.md.
//
// v2 (2026-07-09): client-identifying data removed. `fileName` is gone and the
// raw `fileKey` is replaced by `fileHash`, a one-way hash computed client-side,
// so the server never receives anything that names or locates a client file.
// Distinct-file counts (breadth of use) still work — equal files hash equal.

export type UsageEventType = "action" | "module_open";

export interface UsageEvent {
  schemaVersion: 2;
  type: UsageEventType;
  module: string;
  action: string | null;
  fileHash: string;
  pluginVersion: string;
  sessionId: string;
  clientTs: string;
}

// The identity part of an event, derived from an incoming message before
// figma context is attached. `null` means "drop this message" (denylist).
export interface EventIdentity {
  type: UsageEventType;
  module: string;
  action: string | null;
}
