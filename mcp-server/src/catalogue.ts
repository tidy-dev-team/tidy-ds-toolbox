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
}

export const CATALOGUE: CatalogueEntry[] = [
  {
    id: "misprint.find-components",
    kind: "query",
    module: "utilities",
    summary:
      "Find components and component sets in the active Figma file. Returns node ids that can be passed to misprint.apply.",
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
    id: "misprint.apply",
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
    id: "ds-template.run",
    kind: "execute",
    module: "utilities",
    summary:
      "Stamp the standard DS Template pages into the file. NOT idempotent — running twice creates duplicate pages (designer-acknowledged trade-off).",
    inputSchema: {},
  },
];
