// Operation handlers for the Utilities module. Registered into the global
// Operation registry at module load (via src/shared/operations/register-all.ts).
//
// Wire only `misprint.find-components` for now; `misprint.apply` and
// `ds-template.run` come in follow-ups once we've smoketested the round-trip.

import { ErrorCode, OperationError } from "../../shared/operations/errors";
import { registerOperation } from "../../shared/operations/registry";
import { addMisprintToDescription } from "./utils/misprint";
import { buildDsTemplate } from "./utils/dsTemplate";

interface FindComponentsParams {
  scope: "file" | "page";
  pageId?: string;
  namePattern?: string;
}

interface FindComponentsResult {
  components: { id: string; name: string }[];
  summary: string;
}

function globToRegex(g: string): RegExp {
  const escaped = g.split("*").map((s) => s.replace(/[.+?^${}()|[\]\\]/g, "\\$&"));
  return new RegExp("^" + escaped.join(".*") + "$");
}

registerOperation<FindComponentsParams, FindComponentsResult>(
  {
    id: "tidy_misprint_find_components",
    kind: "query",
    module: "utilities",
    summary:
      "Find components and component sets. Returns ids passable to tidy_misprint_apply.",
    paramsExample: { scope: "file" },
  },
  async (params) => {
    if (params.scope !== "file" && params.scope !== "page") {
      throw new OperationError(
        ErrorCode.INVALID_PARAMS,
        "scope must be 'file' or 'page'",
      );
    }
    if (params.scope === "page" && !params.pageId) {
      throw new OperationError(
        ErrorCode.INVALID_PARAMS,
        "pageId required when scope='page'",
      );
    }

    let root: PageNode | DocumentNode;
    if (params.scope === "page") {
      await figma.loadAllPagesAsync();
      const page = figma.root.children.find((p) => p.id === params.pageId);
      if (!page) {
        throw new OperationError(
          ErrorCode.NOT_FOUND,
          `page ${params.pageId} not found`,
          true,
          { pageId: params.pageId },
        );
      }
      root = page;
    } else {
      await figma.loadAllPagesAsync();
      root = figma.root;
    }

    const nodes = root.findAllWithCriteria({
      types: ["COMPONENT", "COMPONENT_SET"],
    });

    const pattern = params.namePattern ? globToRegex(params.namePattern) : null;
    const matches = pattern ? nodes.filter((n) => pattern.test(n.name)) : nodes;

    return {
      components: matches.map((n) => ({ id: n.id, name: n.name })),
      summary: `${matches.length} component(s) matched`,
    };
  },
);

interface ApplyMisprintParams {
  nodeIds: string[];
}
interface ApplyMisprintResult {
  updated: number;
  ids: string[];
}

registerOperation<ApplyMisprintParams, ApplyMisprintResult>(
  {
    id: "tidy_misprint_apply",
    kind: "execute",
    module: "utilities",
    summary:
      "Append/replace a Hebrew-scrambled 'misprint' line on each component's description. Idempotent. Atomic-fails if any id is missing or not a component.",
    paramsExample: { nodeIds: ["1:2"] },
  },
  async (params) => {
    if (!Array.isArray(params.nodeIds) || params.nodeIds.length === 0) {
      throw new OperationError(
        ErrorCode.INVALID_PARAMS,
        "nodeIds must be a non-empty array",
      );
    }

    const missing: string[] = [];
    const wrongType: string[] = [];
    const resolved: (ComponentNode | ComponentSetNode)[] = [];
    for (const id of params.nodeIds) {
      const node = await figma.getNodeByIdAsync(id);
      if (!node) {
        missing.push(id);
        continue;
      }
      if (node.type !== "COMPONENT" && node.type !== "COMPONENT_SET") {
        wrongType.push(id);
        continue;
      }
      resolved.push(node);
    }
    if (missing.length) {
      throw new OperationError(
        ErrorCode.NOT_FOUND,
        `${missing.length} nodeId(s) not found`,
        true,
        { missing },
      );
    }
    if (wrongType.length) {
      throw new OperationError(
        ErrorCode.WRONG_NODE_TYPE,
        `${wrongType.length} node(s) are not components or component sets`,
        true,
        { wrongType },
      );
    }

    for (const node of resolved) {
      addMisprintToDescription(node);
    }

    return {
      updated: resolved.length,
      ids: resolved.map((n) => n.id),
    };
  },
);

interface DsTemplateRunResult {
  pagesCreated: number;
  pageIds: string[];
}

registerOperation<Record<string, never>, DsTemplateRunResult>(
  {
    id: "tidy_ds_template_run",
    kind: "execute",
    module: "utilities",
    summary:
      "Stamp the standard DS Template pages into the file. NOT idempotent — running twice creates duplicate pages.",
    paramsExample: {},
  },
  async () => {
    const pages = await buildDsTemplate();
    return {
      pagesCreated: pages.length,
      pageIds: pages.map((p) => p.id),
    };
  },
);
