// Operation handlers for the Utilities module. Registered into the global
// Operation registry at module load (via src/shared/operations/register-all.ts).
//
// Wire only `misprint.find-components` for now; `misprint.apply` and
// `ds-template.run` come in follow-ups once we've smoketested the round-trip.

import { ErrorCode, OperationError } from "../../shared/operations/errors";
import { registerOperation } from "../../shared/operations/registry";
import {
  applyMisprintDescriptions,
  describeStoppedMisprintApply,
  resolveMisprintTargets,
} from "./utils/misprint";
import { buildDsTemplate, describeStoppedRun } from "./utils/dsTemplate";
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

type ApplyMisprintResult =
  | {
      cancelled: true;
      message: string;
      updated: 0;
      ids: [];
      withoutAliases: [];
    }
  | {
      cancelled?: false;
      updated: number;
      ids: string[];
      /** Names the alias table has no entry for, so #176's line was not written. */
      withoutAliases: string[];
    };

registerOperation<ApplyMisprintParams, ApplyMisprintResult>(
  {
    id: "tidy_misprint_apply",
    kind: "execute",
    module: "utilities",
    summary:
      "Write both searchability lines on each component's description: an 'Also known as:' line of alternative names, and the Hebrew-scrambled 'misprint' line. Idempotent. Names the alias table does not know are returned in `withoutAliases` and get no alias line. Atomic-fails if any id is missing or not a component. Stoppable while validating ids - a stop then leaves every description untouched - and once writing begins a stop is refused and the run completes, so the atomic promise holds either way.",
    // Stoppable during the validation loop (#185). The write loop takes no
    // token on purpose: a stop part way through the writing would leave some
    // descriptions written and others not, breaking the atomic-fails promise
    // the summary makes. See `applyMisprintDescriptions`.
    cancellable: true,
    paramsExample: { nodeIds: ["1:2"] },
  },
  async (params, ctx) => {
    if (!Array.isArray(params.nodeIds) || params.nodeIds.length === 0) {
      throw new OperationError(
        ErrorCode.INVALID_PARAMS,
        "nodeIds must be a non-empty array",
      );
    }

    const resolution = await resolveMisprintTargets(
      params.nodeIds,
      (id) => figma.getNodeByIdAsync(id),
      ctx.cancellation,
    );

    // A stop during validation ends the run before the first write, which is
    // the clean half of the stop decision. The designer is who is left - the
    // Bridge answered the caller when it timed out - hence the notify.
    if (resolution.cancelled) {
      const message = describeStoppedMisprintApply();
      figma.notify(message, { timeout: 10_000 });
      return {
        cancelled: true,
        message,
        updated: 0,
        ids: [],
        withoutAliases: [],
      };
    }

    if (resolution.missing.length) {
      throw new OperationError(
        ErrorCode.NOT_FOUND,
        `${resolution.missing.length} nodeId(s) not found`,
        true,
        { missing: resolution.missing },
      );
    }
    if (resolution.wrongType.length) {
      throw new OperationError(
        ErrorCode.WRONG_NODE_TYPE,
        `${resolution.wrongType.length} node(s) are not components or component sets`,
        true,
        { wrongType: resolution.wrongType },
      );
    }

    return applyMisprintDescriptions(resolution.resolved);
  },
);

interface DsTemplateRunResult {
  pagesCreated: number;
  pageIds: string[];
  /** How many of the template's pages were never stamped. 0 on a full run. */
  pagesRemaining: number;
  /** Whether the run was asked to stop and did, before covering every page. */
  cancelled: boolean;
  /** Present only on a stopped run: what is in the file, in a designer's terms. */
  message?: string;
}

registerOperation<Record<string, never>, DsTemplateRunResult>(
  {
    id: "tidy_ds_template_run",
    kind: "execute",
    module: "utilities",
    summary:
      "Stamp the standard DS Template pages into the file. NOT idempotent — running twice creates duplicate pages.",
    paramsExample: {},
    // The first adopter of the cancellation token (#184). Declaring this is
    // what lets the registry report a stop honestly instead of answering
    // `not_cancellable`; `buildDsTemplate` checks the token and yields
    // between whole pages, which is the pairing the flag is claiming.
    cancellable: true,
  },
  async (_params, ctx) => {
    const { pages, totalPages, cancelled } = await buildDsTemplate(
      ctx.cancellation,
    );
    const stopped = cancelled
      ? describeStoppedRun(pages.length, totalPages)
      : null;

    // The agent that called this was answered by the Bridge when it timed out,
    // so nothing below reaches it. The designer is who is left, and the pages
    // are already on their canvas - hence the toast rather than only a return
    // value that lands in a log as a response for an unknown id.
    if (stopped) figma.notify(stopped, { timeout: 10_000 });

    return {
      pagesCreated: pages.length,
      pageIds: pages.map((p) => p.id),
      pagesRemaining: totalPages - pages.length,
      cancelled,
      ...(stopped ? { message: stopped } : {}),
    };
  },
);
