// PROTOTYPE scaffold — static catalogue of operations exposed by the MCP server.
// Per ADR-0004: the MCP server holds the catalogue; the plugin advertises a
// version on Bridge connect and rejects unsupported ops with typed errors.
//
// Schemas are Zod because (a) the MCP SDK wants Zod for `inputSchema`, and
// (b) the handoff already recommended Zod + zod-to-json-schema. If that choice
// gets revisited (open branch #1), this file is the place it lands.

import { z } from "zod";
import type { OperationKind } from "../../src/shared/operations/types.ts";
import { DocSpecSchema } from "../../src/plugins/tidy-doc/utils/docSpec.ts";
import {
  DEFAULT_FIND_LIMIT,
  MAX_FIND_LIMIT,
} from "../../src/plugins/utilities/utils/findComponents.ts";

/**
 * The QA check ids and checklist row count, as agents are told them.
 *
 * Deliberately a local literal rather than an import from
 * `src/plugins/qa/checklist-catalogue.ts`. Importing it would drag the whole
 * pure check engine into this module's graph, and that graph uses extensionless
 * specifiers throughout - fine for the bundled server, fatal for
 * `npm run mcp:smoketest:src`, which runs this file through Node's raw ESM
 * resolver where extensionless imports do not resolve. ADR-0004's hybrid
 * discovery also has the MCP catalogue declaring operations independently of the
 * plugin, and reaching into the engine for a list of strings crosses that line
 * for very little.
 *
 * So drift is caught the same way `/tidy-qa`'s copy is: `agent-surface.test.ts`
 * asserts this list is exactly the engine's `CHECK_IDS`, in order, and that the
 * row count below matches `CHECKLIST_CATALOGUE.length`. That test runs under
 * Vitest, which resolves the engine's imports happily, so the guarantee costs
 * this file no dependency at all. #133 named this as the cheaper option; the
 * expensive one turned out to be broken.
 */
const CHECK_IDS = [
  "set-name-casing",
  "variant-property-bindings",
  "prop-order",
  "tokens",
  "responsive-bounds",
  "asset-provenance",
  "layer-naming-structure",
  "grid-4px",
  "interaction-hover-only",
  "description",
  "no-conflicts",
  "nesting-depth",
  "preferred-values",
  "high-contrast",
  "themes",
  "documentation",
] as const;

/** Checklist rows. Asserted against `CHECKLIST_CATALOGUE.length` by the test above. */
const ROW_COUNT = 19;

export interface CatalogueEntry {
  id: string;
  kind: OperationKind;
  module: string;
  summary: string;
  inputSchema: z.ZodRawShape;
  // Per-operation bridge timeout override. Falls back to the default in
  // BridgeServer (30s) when omitted. Set higher for ops that legitimately take
  // long (heavy text-node creation, batch builds, report generation).
  //
  // Rule of thumb from #128: anything whose cost scales with the *size of the
  // file* rather than with one node must not sit on the 30s default. The
  // entries deliberately left on it are the O(1) ones: a single node read
  // (tidy_component_labels_get_variant_props), a static-registry filter
  // (tidy_ds_explorer_list_components) and a page-name list
  // (tidy_file_list_pages).
  timeoutMs?: number;
}

export const CATALOGUE: CatalogueEntry[] = [
  {
    id: "tidy_misprint_find_components",
    kind: "query",
    module: "utilities",
    summary:
      "Find components and component sets in the active Figma file. Returns node ids that can be passed to tidy_misprint_apply, plus `total`, `truncated` and `omitted`. A truncated result is a partial view of the file, not the whole of it. `namePattern` filters the response but does NOT make the scan cheaper: a whole-file walk visits every node regardless. On a large file (an icon library) prefer scope='page', discovering pageIds with tidy_file_list_pages.",
    inputSchema: {
      scope: z
        .enum(["file", "page"])
        .describe(
          "Whether to search the whole file or a single page. 'file' is an unbounded walk, so on a large file prefer 'page'.",
        ),
      pageId: z
        .string()
        .optional()
        .describe(
          "Required when scope='page'. The Figma page id; list them with tidy_file_list_pages.",
        ),
      namePattern: z
        .string()
        .optional()
        .describe(
          "Optional glob (e.g. 'Btn*') matched against node names. Case-sensitive, '*' is the only wildcard, and a pattern with no '*' is an exact match.",
        ),
      limit: z
        .number()
        .int()
        .min(1)
        .max(MAX_FIND_LIMIT)
        .optional()
        .describe(
          `Maximum components to return. Defaults to ${DEFAULT_FIND_LIMIT}. Anything beyond it is reported in \`omitted\`, never dropped silently.`,
        ),
    },
    // A whole-file walk is unbounded work; 30s is not enough on an icon
    // library. Matched to the other scanning operations (#128).
    timeoutMs: 60_000,
  },
  {
    id: "tidy_file_list_pages",
    kind: "query",
    module: "utilities",
    summary:
      "List the pages in the active Figma file (id + name) and the current page id. Cheap: reads page names without loading page contents. This is how an agent gets a pageId for scope='page' on the scanning operations, instead of needing the designer to click a page first.",
    inputSchema: {},
  },
  {
    id: "tidy_misprint_apply",
    kind: "execute",
    module: "utilities",
    summary:
      "Append a Hebrew-scrambled 'misprint' line to each component's description for searchability. Idempotent: replaces an existing misprint line if present. Fails atomically if any nodeId is missing or not a component.",
    inputSchema: {
      nodeIds: z
        .array(z.string())
        .min(1)
        .describe("Ids of components or component sets to update."),
    },
    // Cost scales with nodeIds: one async lookup plus a description write per
    // id, and a find on an icon library legitimately yields hundreds (#128).
    timeoutMs: 60_000,
  },
  {
    id: "tidy_ds_template_run",
    kind: "execute",
    module: "utilities",
    summary:
      "Stamp the standard DS Template pages into the file. NOT idempotent — running twice creates duplicate pages (designer-acknowledged trade-off).",
    inputSchema: {},
    timeoutMs: 120_000,
  },
  {
    id: "tidy_component_labels_get_variant_props",
    kind: "query",
    module: "component-labels",
    summary:
      "Inspect a component set and return its variant properties (name, options, default). Pass nodeId, or omit it to use the current selection. Errors if the target isn't a component set.",
    inputSchema: {
      nodeId: z
        .string()
        .optional()
        .describe(
          "Optional Figma node id of a COMPONENT_SET. If omitted, the current selection is used.",
        ),
    },
  },
  {
    id: "tidy_component_labels_build",
    kind: "execute",
    module: "component-labels",
    summary:
      "Build variant labels around a component set's top and left edges. Pass nodeId, or omit it to use the current selection. The `labels` object maps each axis (top, left, secondTop, secondLeft) to a variant property name on the set; empty string means no label on that axis. Errors if any axis references an unknown variant property.",
    inputSchema: {
      nodeId: z
        .string()
        .optional()
        .describe(
          "Optional Figma node id of a COMPONENT_SET. If omitted, the current selection is used.",
        ),
      labels: z
        .object({
          top: z
            .string()
            .describe(
              "Variant property name to label along the top edge. Empty string skips this axis.",
            ),
          left: z
            .string()
            .describe(
              "Variant property name to label along the left edge. Empty string skips this axis.",
            ),
          secondTop: z
            .string()
            .describe(
              "Variant property name for the second-level top labels (above the primary top row). Empty string skips.",
            ),
          secondLeft: z
            .string()
            .describe(
              "Variant property name for the second-level left labels (left of the primary left column). Empty string skips.",
            ),
          groupSecondTop: z
            .boolean()
            .describe(
              "Whether to deduplicate/merge adjacent second-level top labels with the same value.",
            ),
          groupSecondLeft: z
            .boolean()
            .describe(
              "Whether to deduplicate/merge adjacent second-level left labels with the same value.",
            ),
        })
        .describe("Per-axis label configuration."),
      spacing: z
        .number()
        .optional()
        .describe(
          "Pixel spacing between labels and the component set. Defaults to 16.",
        ),
      fontSize: z
        .number()
        .optional()
        .describe("Label font size. Defaults to 12."),
      extractElement: z
        .boolean()
        .optional()
        .describe(
          "If true, extract the component set to a top-level frame after labelling. Defaults to false.",
        ),
    },
    timeoutMs: 120_000,
  },
  {
    id: "tidy_ds_explorer_list_components",
    kind: "query",
    module: "ds-explorer",
    summary:
      "List the design-system components registered in DS Explorer (name + library key). Optionally filtered by a name glob (e.g. 'Avatar*'). Names returned here are the valid inputs to tidy_ds_explorer_get_component.",
    inputSchema: {
      namePattern: z
        .string()
        .optional()
        .describe(
          "Optional glob matched against component names (e.g. 'Avatar*', '*Badge').",
        ),
    },
  },
  {
    id: "tidy_ds_explorer_get_component",
    kind: "query",
    module: "ds-explorer",
    summary:
      "Import a registered DS Explorer component by name and return its properties, description, and nested instances. Set includeImage=true to also see the component: the preview is returned as an image content block you can actually look at, not as text (heavier - only when seeing it matters). Errors INVALID_PARAMS with details.availableNames if the name is unknown.",
    inputSchema: {
      name: z
        .string()
        .describe(
          "Exact name of a component registered in DS Explorer (e.g. 'Avatar', 'Button Icon'). Use tidy_ds_explorer_list_components to discover valid names.",
        ),
      includeImage: z
        .boolean()
        .optional()
        .describe(
          "If true, render a PNG preview of the component (default variant for sets) and return it as a viewable image block alongside the JSON. Defaults to false.",
        ),
    },
    timeoutMs: 60_000,
  },
  {
    id: "tidy_ds_explorer_place_set",
    kind: "execute",
    module: "ds-explorer",
    summary:
      "Place a registered DS Explorer component SET onto a page as an editable clone, ready to be labelled by tidy_component_labels_build. By default (localize='full') the clone is de-linked from Kido-DS: nested instances are detached into frames and paint/text/effect styles are localized; variables/tokens stay bound to Kido-DS. Defaults to the current page and the viewport centre. Returns the new nodeId so it can be piped into tidy_component_labels_build. Errors WRONG_NODE_TYPE if the named component is a single component (not a set).",
    inputSchema: {
      name: z
        .string()
        .describe(
          "Exact name of a component set registered in DS Explorer (e.g. 'Buttons'). Use tidy_ds_explorer_list_components to discover valid names.",
        ),
      pageId: z
        .string()
        .optional()
        .describe(
          "Optional Figma page id to place the set on. Defaults to the current page.",
        ),
      x: z
        .number()
        .optional()
        .describe(
          "Optional x coordinate (top-left) on the page. Defaults to the viewport centre.",
        ),
      y: z
        .number()
        .optional()
        .describe(
          "Optional y coordinate (top-left) on the page. Defaults to the viewport centre.",
        ),
      localize: z
        .enum(["none", "detach", "styles", "full"])
        .optional()
        .describe(
          "How far to de-link the clone from Kido-DS. 'none' = keep all links (old behavior); 'detach' = detach nested instances into frames; 'styles' = localize paint/text/effect styles; 'full' (default) = both. Variables/tokens are always left bound to Kido-DS.",
        ),
    },
    timeoutMs: 60_000,
  },
  {
    id: "tidy_doc_read_component",
    kind: "query",
    module: "tidy-doc",
    summary:
      "Return the derived facts for a component or component set: variant categorisation (chosen family axis + values, state axis + values, demoted axes, pinned defaults), `breakdown` anatomy facts (height/width/icon placement), `modeCollections` (multi-mode variable collections the component is bound to), and `relatedCandidates` (ranked sibling components from a file-wide token-overlap scan). Pass nodeId, or omit it to use the current selection. Authoring a Doc Spec's `variants` keys against `familyAxis.values`, and its `related` keys against `relatedCandidates`, is the intended next step.",
    inputSchema: {
      nodeId: z
        .string()
        .optional()
        .describe(
          "Optional Figma node id of a COMPONENT or COMPONENT_SET. If omitted, the current selection is used.",
        ),
    },
    timeoutMs: 60_000,
  },
  {
    id: "tidy_doc_build_page",
    kind: "execute",
    module: "tidy-doc",
    summary:
      "Build (or replace) a Documentation Page next to the source component: Chrome (card + header + status badge) plus Variants, Component Breakdown, Mode, Usage Guidelines, and Related Components Sections when their Doc Spec keys and derived facts provide content. Re-running for the same source deletes the prior page and rebuilds fresh. Symbolic references (variant family values, Do/Don't axis values, related sibling names) are resolved against live derived facts and fail with a batched INVALID_PARAMS payload (`details.unresolved`, with `didYouMean` hints).",
    inputSchema: {
      nodeId: z
        .string()
        .optional()
        .describe(
          "Optional Figma node id of a COMPONENT or COMPONENT_SET. If omitted, the current selection is used.",
        ),
      docSpec: DocSpecSchema.describe(
        "The Doc Spec. `status` is required; `variants` maps family-axis values to authored descriptions (+ optional whenToUse bullets). `breakdown` triggers derived anatomy sub-sections when facts exist. `mode` triggers auto-detected, capped mode showcases with an optional caption. `guidelines` renders bullet lists and Do/Don't SpecimenScenes. `related` maps exact sibling-candidate names to authored guidance.",
      ),
    },
    timeoutMs: 60_000,
  },
  {
    id: "tidy_qa_run",
    kind: "query",
    module: "qa",
    summary:
      `Run the DS Component QA checklist against a component set. Read-only toward the target - it never modifies the component set - with two documented exceptions, both transient and both removed before the call returns (carve-outs from ADR-0001): the themes (#17) and high-contrast (#16) checks create and remove a temporary off-canvas probe frame in order to resolve variables per theme mode, and \`includeModeImages\` builds, exports and removes the per-mode showcase it returns. Target by nodeId or by name/glob, or omit both to use the current Figma selection; any instance/component resolves up to its owning set. Returns structured CheckResults (status per check, severity + offender node per finding; findings are deduped one-per-defect, so a finding covering several nodes carries \`count\`, a capped \`nodeIds\` list with \`nodeId\` as the representative, and \`nodeNames\` when those nodes had differing names - do not re-group them), ids of requested checks not implemented yet, and a ${ROW_COUNT}-item \`checklist\` model (checklist order) merging engine results with the full DS QA catalogue (pass/warn/fail/manual/not_implemented/not_run/not_applicable - the last when a check ran but had nothing applicable to evaluate, e.g. no instance-swap properties; every such row carries a \`note\` giving the specific reason, which on an asset set is most of what the run established).`,
    inputSchema: {
      nodeId: z
        .string()
        .optional()
        .describe(
          "Figma node id of the target — an instance, component, or component set; resolved up to the owning component set. Pass this, `name`, or neither (falls back to the current selection).",
        ),
      name: z
        .string()
        .optional()
        .describe(
          "Name or glob (e.g. 'Button', 'Notification*') matched against components/sets in the file. Must resolve to exactly one component set — ambiguous matches error with the candidate list. Omit `name` and `nodeId` to use the current selection.",
        ),
      // Enumerated rather than free strings: a typo is then rejected here, with
      // the valid set in the error, instead of after a round trip to the plugin
      // (and only if the plugin happens to be connected).
      checks: z
        .array(z.enum(CHECK_IDS))
        .optional()
        .describe(
          `Optional check-id filter (e.g. ['tokens', 'grid-4px']). Defaults to the full catalogue: ${CHECK_IDS.join(", ")}.`,
        ),
      includeModeImages: z
        .boolean()
        .optional()
        .describe(
          "If true, also return `modeImage`: the component rendered once per theme mode, side by side, as a viewable image block. Use it to judge row 17's visual half - whether the component still reads correctly in every mode - which no check can establish. The themes check only proves variables resolve, and high-contrast only measures text, so a non-text element (icon, border, divider) vanishing into the surface in one mode is invisible to the engine and visible here. Absent when the set has no theme axis to show. Costs a render per mode, so ask for it when the answer matters rather than on every run. Leaves nothing on the canvas: the frames are removed after export.",
        ),
    },
    timeoutMs: 60_000,
  },
  {
    id: "tidy_qa_build_checklist",
    kind: "execute",
    module: "qa",
    summary:
      `Run the DS Component QA checklist and render it as a frame on the canvas next to the target - intended for a placed instance (resolves up to its owning set), or omit the target to use the current selection. Draws all ${ROW_COUNT} checklist items: automated ones with grouped findings, manual ones as empty checkboxes. Alongside it, when the set has more than one theme mode, draws a labelled block showing the default variant rendered once per mode side by side (returned as \`modeShowcaseId\`) - evidence for row 17's visual half, which no check can judge; it never changes any row's status. Idempotent per target - re-running replaces the prior checklist frame instead of duplicating it. Returns only a stub (frame id, target, and pass/warn/fail/manual/pending/notApplicable/notRun counts plus a \`partial\` overlay), never the full findings payload. The status counts sum to all ${ROW_COUNT} rows, so a short total means one was misread rather than rows missing. Takes an explicit nodeId (or the current selection) - no name/glob lookup here; resolve a name to a nodeId with tidy_qa_run first if needed.`,
    inputSchema: {
      nodeId: z
        .string()
        .optional()
        .describe(
          "Figma node id of the target — an instance, component, or component set; resolved up to the owning component set. Omit to fall back to the current selection. The checklist frame is placed next to this node unless `anchorNodeId` is given.",
        ),
      checks: z
        .array(z.enum(CHECK_IDS))
        .optional()
        .describe(
          "Optional check-id filter (same ids as tidy_qa_run). Filtered-out automated rows render as skipped rather than pass/fail.",
        ),
      anchorNodeId: z
        .string()
        .optional()
        .describe(
          "Optional: place the checklist frame next to this node instead of the resolved target — lets the frame stay by the instance even though checks ran against its owning component set.",
        ),
    },
    timeoutMs: 60_000,
  },
];
