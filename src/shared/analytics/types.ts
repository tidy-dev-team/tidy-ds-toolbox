// Schema v1 usage event shape, captured in the plugin thread.
// See docs/prd-usage-analytics-phase1.md (FR3) and docs/usage-analytics-plan.md.

export type UsageEventType = "action" | "module_open";

export interface UsageEvent {
  schemaVersion: 1;
  type: UsageEventType;
  module: string;
  action: string | null;
  fileKey: string;
  fileName: string;
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
