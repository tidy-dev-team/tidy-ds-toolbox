// Operation handlers for the Utilities module. Registered into the global
// Operation registry at module load (via src/shared/operations/register-all.ts).
//
// Wire only `misprint.find-components` for now; `misprint.apply` and
// `ds-template.run` come in follow-ups once we've smoketested the round-trip.

import { ErrorCode, OperationError } from "../../shared/operations/errors";
import { registerOperation } from "../../shared/operations/registry";

interface FindComponentsParams {
  scope: "file" | "page";
  pageId?: string;
  namePattern?: string;
}

interface FindComponentsResult {
  ids: string[];
  summary: string;
}

function globToRegex(g: string): RegExp {
  const escaped = g.split("*").map((s) => s.replace(/[.+?^${}()|[\]\\]/g, "\\$&"));
  return new RegExp("^" + escaped.join(".*") + "$");
}

registerOperation<FindComponentsParams, FindComponentsResult>(
  {
    id: "misprint.find-components",
    kind: "query",
    module: "utilities",
    summary:
      "Find components and component sets. Returns ids passable to misprint.apply.",
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
      ids: matches.map((n) => n.id),
      summary: `${matches.length} component(s) matched`,
    };
  },
);
