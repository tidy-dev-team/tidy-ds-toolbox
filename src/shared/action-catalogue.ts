/**
 * The action catalogue (#162).
 *
 * One table, per action id (`module:action`), declaring two facts a designer
 * can feel the effect of:
 *
 * - `effect`: whether the action reads the document or writes to it.
 * - `budget`: how long it may run — a timed duration, or explicitly
 *   `long-running` with a written `reason` for why it has no deadline.
 *
 * `src/code.ts` derives its timeout decision from this table instead of a
 * hand-typed exemption list, and derives the overrun message's wording from
 * the declared `effect`: a write that overruns is still running and still
 * writing, so the message says so and warns against retrying; a read that
 * overran is just a failure, because nothing is still changing the file.
 *
 * Scope today is deliberately narrow — only the ten actions that need a
 * budget decision right now are declared (see #164/#165 for the rest). An
 * action absent from this table is `classifyAction`'s "undeclared" case and
 * behaves exactly as it did before this table existed: default timeout,
 * default (bare) message.
 *
 * Not covered here, by design: agent-driven Operations dispatch arrives as
 * the single action `mcp-bridge:dispatch` (the specific Operation id is
 * opaque at this layer — see src/code.ts). It is declared `long-running`
 * below so the plugin-thread deadline never fires for it, but the *real*
 * per-Operation limit is enforced independently by the MCP server at the
 * Bridge (mcp-server/src/bridge-server.ts, mcp-server/src/catalogue.ts).
 * That enforcement is unchanged by this ticket.
 */

export type ActionEffect = "reads" | "writes";

export type ActionBudget =
  | { kind: "timed"; ms: number }
  | { kind: "long-running"; reason: string };

export interface ActionCatalogueEntry {
  effect: ActionEffect;
  budget: ActionBudget;
  /**
   * Whether the action's loop can be asked to stop early via a cancellation
   * token (#167). Actions with no entry, or an entry that omits this field,
   * are not stoppable — a handler that hasn't adopted the token must not
   * show a stop control that would do nothing.
   */
  stoppable?: boolean;
}

/** Default timeout applied to any action absent from the catalogue. */
export const DEFAULT_TIMEOUT_MS = 30000;

export const ACTION_CATALOGUE: Record<string, ActionCatalogueEntry> = {
  "sticker-sheet-builder:build-all": {
    effect: "writes",
    budget: {
      kind: "long-running",
      reason:
        "Loops over every variant in the set, building a sticker-sheet frame per variant — can exceed the default timeout on large sets.",
    },
    stoppable: true,
  },
  "sticker-sheet-builder:build-one": {
    effect: "writes",
    budget: {
      kind: "long-running",
      reason:
        "Builds a single sticker-sheet frame, but shares the build path with build-all and can still exceed the default timeout on a complex variant.",
    },
  },
  "audit:generate-report": {
    effect: "writes",
    budget: {
      kind: "long-running",
      reason:
        "Draws the full audit report frame, one section per finding — can exceed the default timeout on a large file.",
    },
  },
  "ds-explorer:build-component": {
    effect: "writes",
    budget: {
      kind: "long-running",
      reason:
        "Builds a clone, prunes variants, then de-links from Kido-DS (detaches nested instances and localizes styles) — can exceed the default timeout on large sets.",
    },
  },
  "color-finder:scan-colors": {
    effect: "writes",
    budget: {
      kind: "long-running",
      reason:
        "Walks every node on the chosen scope (optionally all pages) extracting solid-color usages, then renders an inventory page — can exceed the default timeout on large files. Emits progress updates while it runs.",
    },
    stoppable: true,
  },
  "color-finder:scan-image-palette": {
    effect: "writes",
    budget: {
      kind: "long-running",
      reason:
        "Shares the scan path with scan-colors and can exceed the default timeout for the same reason.",
    },
  },
  "release-notes:publish-notes": {
    effect: "writes",
    budget: {
      kind: "long-running",
      reason:
        "Rebuilds the aggregate changelog plus one card per Subject the sprint touched, each a few hundred nodes — a busy sprint can exceed the default timeout.",
    },
  },
  "mcp-bridge:dispatch": {
    // The specific Operation id is opaque at this layer (see file header).
    // Declared "writes" as the conservative default for message wording,
    // but this can never actually overrun: it's long-running, and the real
    // per-Operation limit is enforced by the MCP server at the Bridge.
    effect: "writes",
    budget: {
      kind: "long-running",
      reason:
        "Every MCP-invoked Operation arrives here as a single opaque dispatch action. The plugin thread cannot know the real per-Operation budget, so it is exempt by design; the MCP server enforces its own limit at the Bridge instead.",
    },
  },
  "audit:export-multipage-pdf": {
    effect: "writes",
    budget: {
      kind: "long-running",
      reason:
        "Exports every page of a multi-page audit report to PDF — can exceed the default timeout on the team's largest files.",
    },
  },
  "off-boarding:pack-pages": {
    effect: "writes",
    budget: {
      kind: "long-running",
      reason:
        "Loops over every page being packed, moving and relabelling nodes per page — can exceed the default timeout on files with many pages.",
    },
    stoppable: true,
  },
};

/** Result of classifying an action id against the catalogue. */
export interface ActionClassification {
  /** Whether this action id has its own catalogue entry. */
  declared: boolean;
  effect: ActionEffect;
  budget: ActionBudget;
  stoppable?: boolean;
}

/**
 * Classifies an action id: catalogue lookup, falling back to today's
 * default behaviour (timed, default timeout) when the action is undeclared.
 *
 * Pure — no Figma document needed.
 */
export function classifyAction(actionId: string): ActionClassification {
  const entry = ACTION_CATALOGUE[actionId];
  if (entry) {
    return { declared: true, ...entry };
  }
  return {
    declared: false,
    // Undeclared actions get the bare, pre-#162 overrun message regardless
    // of this value — see buildOverrunMessage's `declared` gate below.
    effect: "writes",
    budget: { kind: "timed", ms: DEFAULT_TIMEOUT_MS },
  };
}

/**
 * Constructs the overrun message text for an action that hit its timeout.
 *
 * Write actions: says the work continues, warns against re-running, tells
 * the designer to check the canvas first.
 * Read actions: a plain failure, no "still running" wording — a read that
 * stopped being watched changed nothing.
 * Undeclared actions: today's bare message, unchanged by this ticket.
 *
 * Never implies a cancellation happened — nothing was actually stopped.
 *
 * Pure — no Figma document needed.
 */
export function buildOverrunMessage(
  operationName: string,
  classification: ActionClassification,
): string {
  if (!classification.declared) {
    return `Operation '${operationName}' timed out after ${DEFAULT_TIMEOUT_MS}ms`;
  }

  if (classification.effect === "reads") {
    return `Operation '${operationName}' timed out and failed.`;
  }

  return (
    `Operation '${operationName}' is taking longer than expected, but the work continues in the background and is still writing to the file. ` +
    `Please check the canvas before running it again, so you don't start a second run against the same file.`
  );
}
