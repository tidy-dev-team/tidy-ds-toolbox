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
    // Corrected during #165: reading scanImagePalette's handler body shows
    // it only exports PNG bytes per image node and reports progress — no
    // node/page is created or mutated. It is a read, not a write. The
    // long-running budget is unchanged (#164/#165 rule: no action loses a
    // budget it had) — it still loops over every image on every page in
    // scope, which is genuinely slow on a large file.
    effect: "reads",
    budget: {
      kind: "long-running",
      reason:
        "Walks every page in scope exporting each image-bearing node to PNG for palette extraction — can exceed the default timeout on large files.",
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

  // --- #164: document-writing modules --------------------------------
  // Off-Boarding (target "off-boarding"). pack-pages declared above (#162).
  "off-boarding:get-pages": {
    effect: "reads",
    budget: { kind: "timed", ms: DEFAULT_TIMEOUT_MS },
  },
  "off-boarding:unpack-pages": {
    effect: "writes",
    budget: { kind: "timed", ms: DEFAULT_TIMEOUT_MS },
  },
  "off-boarding:find-bound-variables": {
    effect: "reads",
    budget: { kind: "timed", ms: DEFAULT_TIMEOUT_MS },
  },
  "off-boarding:find-hidden-styles": {
    effect: "reads",
    budget: { kind: "timed", ms: DEFAULT_TIMEOUT_MS },
  },

  // Sticker Sheet Builder (target "sticker-sheet-builder"). build-all /
  // build-one declared above (#162).
  "sticker-sheet-builder:init": {
    effect: "reads",
    budget: { kind: "timed", ms: DEFAULT_TIMEOUT_MS },
  },
  "sticker-sheet-builder:load-context": {
    effect: "reads",
    budget: { kind: "timed", ms: DEFAULT_TIMEOUT_MS },
  },
  "sticker-sheet-builder:update-config": {
    effect: "writes",
    budget: { kind: "timed", ms: DEFAULT_TIMEOUT_MS },
  },
  "sticker-sheet-builder:cancel-build": {
    effect: "reads",
    budget: { kind: "timed", ms: DEFAULT_TIMEOUT_MS },
  },

  // Component Labels (target "component-labels").
  "component-labels:init": {
    effect: "reads",
    budget: { kind: "timed", ms: DEFAULT_TIMEOUT_MS },
  },
  "component-labels:selection-change": {
    effect: "reads",
    budget: { kind: "timed", ms: DEFAULT_TIMEOUT_MS },
  },
  "component-labels:build-labels": {
    effect: "writes",
    budget: { kind: "timed", ms: DEFAULT_TIMEOUT_MS },
  },

  // Audit (target "audit"). generate-report and export-multipage-pdf
  // declared above (#162).
  "audit:add-note": {
    effect: "writes",
    budget: { kind: "timed", ms: DEFAULT_TIMEOUT_MS },
  },
  "audit:add-quick-win": {
    effect: "writes",
    budget: { kind: "timed", ms: DEFAULT_TIMEOUT_MS },
  },
  "audit:export-pdf": {
    // findReportFrameForExport() sets layoutMode = "VERTICAL" as a real,
    // unconditional side effect (see src/plugins/audit/logic.ts, #163) —
    // a genuine document write, even though the action's purpose is export.
    effect: "writes",
    budget: { kind: "timed", ms: DEFAULT_TIMEOUT_MS },
  },
  "audit:export-csv": {
    effect: "reads",
    budget: { kind: "timed", ms: DEFAULT_TIMEOUT_MS },
  },
  "audit:update-from-canvas": {
    effect: "writes",
    budget: { kind: "timed", ms: DEFAULT_TIMEOUT_MS },
  },
  "audit:erase-notes-on-canvas": {
    effect: "writes",
    budget: { kind: "timed", ms: DEFAULT_TIMEOUT_MS },
  },
  "audit:erase-report": {
    effect: "writes",
    budget: { kind: "timed", ms: DEFAULT_TIMEOUT_MS },
  },
  "audit:get-selection-state": {
    effect: "reads",
    budget: { kind: "timed", ms: DEFAULT_TIMEOUT_MS },
  },
  "audit:check-report-exists": {
    // Pure read as of #163 — findReportFrame() no longer mutates layoutMode.
    effect: "reads",
    budget: { kind: "timed", ms: DEFAULT_TIMEOUT_MS },
  },

  // Release Notes (target "release-notes"). publish-notes declared above
  // (#162).
  "release-notes:scan-components": {
    // Can incidentally self-heal a stale stored component-id pointer via a
    // plugin-data write, but that depends on file state, not the (absent)
    // payload — declared as the read it presents as, per handler reading.
    effect: "reads",
    budget: { kind: "timed", ms: DEFAULT_TIMEOUT_MS },
  },
  "release-notes:select-component": {
    effect: "writes",
    budget: { kind: "timed", ms: DEFAULT_TIMEOUT_MS },
  },
  "release-notes:load-appearance": {
    effect: "reads",
    budget: { kind: "timed", ms: DEFAULT_TIMEOUT_MS },
  },
  "release-notes:set-appearance": {
    effect: "writes",
    budget: { kind: "timed", ms: DEFAULT_TIMEOUT_MS },
  },
  "release-notes:load-foundation-pages": {
    effect: "reads",
    budget: { kind: "timed", ms: DEFAULT_TIMEOUT_MS },
  },
  "release-notes:select-foundation-page": {
    effect: "writes",
    budget: { kind: "timed", ms: DEFAULT_TIMEOUT_MS },
  },
  "release-notes:load-sprints": {
    effect: "reads",
    budget: { kind: "timed", ms: DEFAULT_TIMEOUT_MS },
  },
  "release-notes:create-sprint": {
    effect: "writes",
    budget: { kind: "timed", ms: DEFAULT_TIMEOUT_MS },
  },
  "release-notes:rename-sprint": {
    effect: "writes",
    budget: { kind: "timed", ms: DEFAULT_TIMEOUT_MS },
  },
  "release-notes:delete-sprint": {
    effect: "writes",
    budget: { kind: "timed", ms: DEFAULT_TIMEOUT_MS },
  },
  "release-notes:select-sprint": {
    effect: "writes",
    budget: { kind: "timed", ms: DEFAULT_TIMEOUT_MS },
  },
  "release-notes:add-note": {
    effect: "writes",
    budget: { kind: "timed", ms: DEFAULT_TIMEOUT_MS },
  },
  "release-notes:edit-note": {
    effect: "writes",
    budget: { kind: "timed", ms: DEFAULT_TIMEOUT_MS },
  },
  "release-notes:delete-note": {
    effect: "writes",
    budget: { kind: "timed", ms: DEFAULT_TIMEOUT_MS },
  },
  "release-notes:view-subject": {
    effect: "reads",
    budget: { kind: "timed", ms: DEFAULT_TIMEOUT_MS },
  },
  "release-notes:preview-clear-canvas": {
    effect: "reads",
    budget: { kind: "timed", ms: DEFAULT_TIMEOUT_MS },
  },
  "release-notes:clear-canvas": {
    effect: "writes",
    budget: { kind: "timed", ms: DEFAULT_TIMEOUT_MS },
  },
  "release-notes:export-notes": {
    effect: "reads",
    budget: { kind: "timed", ms: DEFAULT_TIMEOUT_MS },
  },
  "release-notes:export-csv": {
    effect: "reads",
    budget: { kind: "timed", ms: DEFAULT_TIMEOUT_MS },
  },
  "release-notes:get-file-context": {
    effect: "reads",
    budget: { kind: "timed", ms: DEFAULT_TIMEOUT_MS },
  },
  "release-notes:set-file-key": {
    effect: "writes",
    budget: { kind: "timed", ms: DEFAULT_TIMEOUT_MS },
  },
  "release-notes:import-notes": {
    effect: "writes",
    budget: { kind: "timed", ms: DEFAULT_TIMEOUT_MS },
  },

  // DS Explorer (target "ds-explorer"). build-component declared above
  // (#162).
  "ds-explorer:get-component-properties": {
    effect: "reads",
    budget: { kind: "timed", ms: DEFAULT_TIMEOUT_MS },
  },

  // --- #165: read-mostly modules --------------------------------------
  // Utilities (target "utilities"). Description-stamping and DS-Template
  // page creation are writes, not reads, despite the module's name.
  "utilities:address-note": {
    effect: "writes",
    budget: { kind: "timed", ms: DEFAULT_TIMEOUT_MS },
  },
  "utilities:image-wrapper": {
    effect: "writes",
    budget: { kind: "timed", ms: DEFAULT_TIMEOUT_MS },
  },
  "utilities:misprint": {
    effect: "writes",
    budget: { kind: "timed", ms: DEFAULT_TIMEOUT_MS },
  },
  "utilities:ds-template": {
    effect: "writes",
    budget: {
      kind: "long-running",
      reason:
        "Creates every DS Template page (roughly seventy) and builds a header frame per page — a whole-file structural build that can exceed the default timeout.",
    },
  },

  // Tidy Mapper (target "tidy-mapper"). Its page-creating action is a
  // write, not a read, despite the module otherwise reading a lot.
  "tidy-mapper:grab-slices": {
    effect: "writes",
    budget: {
      kind: "long-running",
      reason:
        "Rasterizes every slice on the current page, builds trail frames, and creates a page to hold them — can exceed the default timeout on a busy page.",
    },
  },
  "tidy-mapper:set-slice-name": {
    effect: "writes",
    budget: { kind: "timed", ms: DEFAULT_TIMEOUT_MS },
  },
  "tidy-mapper:show-trails": {
    effect: "writes",
    budget: { kind: "timed", ms: DEFAULT_TIMEOUT_MS },
  },
  "tidy-mapper:show-chosen": {
    effect: "writes",
    budget: { kind: "timed", ms: DEFAULT_TIMEOUT_MS },
  },
  "tidy-mapper:get-trail-names": {
    effect: "reads",
    budget: { kind: "timed", ms: DEFAULT_TIMEOUT_MS },
  },
  "tidy-mapper:get-current-name": {
    effect: "reads",
    budget: { kind: "timed", ms: DEFAULT_TIMEOUT_MS },
  },

  // Color Finder (target "color-finder"). scan-colors and
  // scan-image-palette declared above (#162, corrected above in #165).
  "color-finder:list-pages": {
    effect: "reads",
    budget: { kind: "timed", ms: DEFAULT_TIMEOUT_MS },
  },
  "color-finder:show-page": {
    // Navigation only (sets figma.currentPage / scrolls into view) — not a
    // document mutation, per the same convention used elsewhere in this
    // catalogue for selection/viewport-only side effects.
    effect: "reads",
    budget: { kind: "timed", ms: DEFAULT_TIMEOUT_MS },
  },
  "color-finder:render-palette-page": {
    effect: "writes",
    budget: { kind: "timed", ms: DEFAULT_TIMEOUT_MS },
  },

  // Icon Finder (target "iconfinder"). All reads, confirmed by handler.
  "iconfinder:start": {
    effect: "reads",
    budget: { kind: "timed", ms: DEFAULT_TIMEOUT_MS },
  },
  "iconfinder:stop": {
    effect: "reads",
    budget: { kind: "timed", ms: DEFAULT_TIMEOUT_MS },
  },

  // Tidy Icon Care (target "tidy-icon-care").
  "tidy-icon-care:load-params": {
    effect: "reads",
    budget: { kind: "timed", ms: DEFAULT_TIMEOUT_MS },
  },
  "tidy-icon-care:save-params": {
    // Persists to figma.clientStorage (plugin settings), not document
    // nodes — not a document write by this catalogue's convention.
    effect: "reads",
    budget: { kind: "timed", ms: DEFAULT_TIMEOUT_MS },
  },
  "tidy-icon-care:build-icon-grid": {
    effect: "writes",
    budget: {
      kind: "long-running",
      reason:
        "Builds a labelled icon grid across the whole selection — detaches instances, appends labels and columns, and edits descriptions per icon — can exceed the default timeout on a large selection.",
    },
  },

  // tidy-doc (target "tidy-doc"). Its Operations surface
  // (tidy_doc_read_component / tidy_doc_build_page) arrives via the
  // exempt mcp-bridge:dispatch action, not through this target, so it
  // has no separate entries here.
  "tidy-doc:get-context": {
    effect: "reads",
    budget: { kind: "timed", ms: DEFAULT_TIMEOUT_MS },
  },
  "tidy-doc:document-selection": {
    effect: "writes",
    budget: { kind: "timed", ms: DEFAULT_TIMEOUT_MS },
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
