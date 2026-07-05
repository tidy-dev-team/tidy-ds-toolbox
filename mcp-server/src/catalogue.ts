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

export interface CatalogueEntry {
  id: string;
  kind: OperationKind;
  module: string;
  summary: string;
  inputSchema: z.ZodRawShape;
  // Per-operation bridge timeout override. Falls back to the default in
  // BridgeServer when omitted. Set higher for ops that legitimately take
  // long (heavy text-node creation, batch builds, report generation).
  timeoutMs?: number;
}

export const CATALOGUE: CatalogueEntry[] = [
  {
    id: "tidy_misprint_find_components",
    kind: "query",
    module: "utilities",
    summary:
      "Find components and component sets in the active Figma file. Returns node ids that can be passed to tidy_misprint_apply.",
    inputSchema: {
      scope: z
        .enum(["file", "page"])
        .describe("Whether to search the whole file or a single page."),
      pageId: z
        .string()
        .optional()
        .describe("Required when scope='page'. The Figma page id."),
      namePattern: z
        .string()
        .optional()
        .describe("Optional glob (e.g. 'Btn*') matched against node names."),
    },
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
        .describe("Pixel spacing between labels and the component set. Defaults to 16."),
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
      "Import a registered DS Explorer component by name and return its properties, description, and nested instances. Set includeImage=true to also return a base64 PNG preview (heavier — only when the agent needs to actually see the component). Errors INVALID_PARAMS with details.availableNames if the name is unknown.",
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
          "If true, include a base64-encoded PNG preview of the component (default variant for sets). Defaults to false.",
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
      "Return the derived variant categorisation for a component or component set: chosen family axis + values, state axis + values, demoted axes (folded into pinned rest-state defaults), and pinned rest-state defaults for every non-family axis. Pass nodeId, or omit it to use the current selection. Authoring a Doc Spec's `variants` keys against `familyAxis.values` is the intended next step.",
    inputSchema: {
      nodeId: z
        .string()
        .optional()
        .describe(
          "Optional Figma node id of a COMPONENT or COMPONENT_SET. If omitted, the current selection is used.",
        ),
    },
  },
  {
    id: "tidy_doc_build_page",
    kind: "execute",
    module: "tidy-doc",
    summary:
      "Build (or replace) a Documentation Page next to the source component: Chrome (card + header + status badge) plus a Variants Section with one specimen per keyed family value. Re-running for the same source deletes the prior page and rebuilds fresh. `docSpec.variants` keys must be real family-axis values from tidy_doc_read_component; an unresolved key fails the whole call with a batched INVALID_PARAMS error (`details.unresolved`, with `didYouMean` hints) rather than failing on the first bad key.",
    inputSchema: {
      nodeId: z
        .string()
        .optional()
        .describe(
          "Optional Figma node id of a COMPONENT or COMPONENT_SET. If omitted, the current selection is used.",
        ),
      docSpec: DocSpecSchema.describe(
        "The Doc Spec. `status` is required; `variants` maps a family-axis value (from tidy_doc_read_component) to an authored description (+ optional whenToUse bullets). breakdown/mode/guidelines/related are accepted for forward-compatibility but not yet rendered.",
      ),
    },
    timeoutMs: 60_000,
  },
];
