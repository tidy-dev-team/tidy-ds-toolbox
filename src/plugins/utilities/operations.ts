// Operation handlers for the Utilities module. Registered into the global
// Operation registry at module load (via src/shared/operations/register-all.ts).
//
// Wire only `misprint.find-components` for now; `misprint.apply` and
// `ds-template.run` come in follow-ups once we've smoketested the round-trip.

import { ErrorCode, OperationError } from "../../shared/operations/errors";
import { registerOperation } from "../../shared/operations/registry";
import { addSearchabilityToDescription } from "./utils/misprint";
import { buildDsTemplate } from "./utils/dsTemplate";
import {
  selectComponents,
  type SelectComponentsResult,
} from "./utils/findComponents";

interface FindComponentsParams {
  scope: "file" | "page";
  pageId?: string;
  namePattern?: string;
  limit?: number;
}

registerOperation<FindComponentsParams, SelectComponentsResult>(
  {
    id: "tidy_misprint_find_components",
    kind: "query",
    module: "utilities",
    summary:
      "Find components and component sets. Returns ids passable to tidy_misprint_apply. Capped output; check `truncated`.",
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

    // The walk itself is the unavoidable cost: `namePattern` cannot prune it,
    // because every node must be visited before its name is known. It shrinks
    // the response, not the scan. `scope: 'page'` is the only real lever, which
    // is why tidy_file_list_pages exists to make pageIds discoverable (#128).
    const nodes = root.findAllWithCriteria({
      types: ["COMPONENT", "COMPONENT_SET"],
    });

    return selectComponents(nodes, {
      namePattern: params.namePattern,
      limit: params.limit,
    });
  },
);

interface ListPagesResult {
  pages: { id: string; name: string }[];
  currentPageId: string;
  summary: string;
}

registerOperation<Record<string, never>, ListPagesResult>(
  {
    id: "tidy_file_list_pages",
    kind: "query",
    module: "utilities",
    summary:
      "List the pages in the active file (id + name) so scope='page' is reachable without a human clicking first.",
    paramsExample: {},
  },
  // Cheap by construction: page *names and ids* are available without loading
  // any page's contents, which is the whole point. This is the lever an agent
  // reaches for when a whole-file walk is too expensive.
  async () => {
    const pages = figma.root.children.map((p) => ({ id: p.id, name: p.name }));
    return {
      pages,
      currentPageId: figma.currentPage.id,
      summary: `${pages.length} page(s)`,
    };
  },
);

interface ApplyMisprintParams {
  nodeIds: string[];
}
interface ApplyMisprintResult {
  updated: number;
  ids: string[];
  /** Names the alias table has no entry for, so #176's line was not written. */
  withoutAliases: string[];
}

registerOperation<ApplyMisprintParams, ApplyMisprintResult>(
  {
    id: "tidy_misprint_apply",
    kind: "execute",
    module: "utilities",
    summary:
      "Write both searchability lines on each component's description: an 'Also known as:' line of alternative names, and the Hebrew-scrambled 'misprint' line. Idempotent. Names the alias table does not know are returned in `withoutAliases` and get no alias line. Atomic-fails if any id is missing or not a component.",
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

    const withoutAliases: string[] = [];
    for (const node of resolved) {
      const { aliases } = addSearchabilityToDescription(node);
      if (aliases.length === 0) withoutAliases.push(node.name);
    }

    return {
      updated: resolved.length,
      ids: resolved.map((n) => n.id),
      withoutAliases,
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
