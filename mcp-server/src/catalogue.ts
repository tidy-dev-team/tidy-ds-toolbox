// PROTOTYPE scaffold — static catalogue of operations exposed by the MCP server.
// Per ADR-0004: the MCP server holds the catalogue; the plugin advertises a
// version on Bridge connect and rejects unsupported ops with typed errors.
//
// Schemas are Zod because (a) the MCP SDK wants Zod for `inputSchema`, and
// (b) the handoff already recommended Zod + zod-to-json-schema. If that choice
// gets revisited (open branch #1), this file is the place it lands.

import { z } from "zod";
import type { OperationKind } from "../../src/shared/operations/types.ts";

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
];
