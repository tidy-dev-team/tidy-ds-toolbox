// Operation handlers for the tidy-doc module. Registered into the global
// Operation registry at module load (via src/shared/operations/register-all.ts).

import { ErrorCode, OperationError } from "../../shared/operations/errors";
import { registerOperation } from "../../shared/operations/registry";
import { resolveComponentByIdOrSelection } from "../../shared/operations/resolveComponent";
import { deriveFacts } from "./utils/deriveFacts";
import { buildDocPage } from "./utils/buildDocPage";
import { DocSpecSchema, type DocSpec } from "./utils/docSpec";
import type { DerivedFacts } from "./utils/facts";

const ALLOWED_TYPES = ["COMPONENT", "COMPONENT_SET"] as const;

function resolveComponent(
  nodeId: string | undefined,
): Promise<ComponentNode | ComponentSetNode> {
  return resolveComponentByIdOrSelection(nodeId, ALLOWED_TYPES);
}

interface ReadComponentParams {
  nodeId?: string;
}

registerOperation<ReadComponentParams, DerivedFacts>(
  {
    id: "tidy_doc_read_component",
    kind: "query",
    module: "tidy-doc",
    summary:
      "Return the derived variant categorisation for a selected/idened component or component set: family axis + values, state axis + values, demoted axes, pinned rest-state defaults.",
    paramsExample: {},
  },
  async (params) => {
    const source = await resolveComponent(params.nodeId);
    return await deriveFacts(source);
  },
);

interface BuildPageParams {
  nodeId?: string;
  docSpec: DocSpec;
}

type BuildPageResult =
  | { cancelled: true; message: string; sourceComponentId: string }
  | {
      cancelled?: false;
      pageFrameId: string;
      sourceComponentId: string;
    };

registerOperation<BuildPageParams, BuildPageResult>(
  {
    id: "tidy_doc_build_page",
    kind: "execute",
    module: "tidy-doc",
    summary:
      "Build (or replace) a Documentation Page next to the source component: Chrome (status badge) + a Variants Section with one specimen per keyed family. Re-running replaces the prior page for the same source. Rejects unresolved family-value references in a single batched error. Stoppable during its read-and-plan half (facts, reference resolution, scan for the prior page) - a stop then leaves the existing page untouched. Once the rebuild begins it is not interrupted: a run stopped with the old page deleted and the new one half-built is exactly what the boundaries exist to prevent.",
    // Stoppable in the read-and-plan half only (#185); past the last
    // checkpoint the removal and rebuild are one committed region and the
    // token is never consulted. See `buildDocPageUnguarded`.
    cancellable: true,
    paramsExample: { docSpec: { status: "IDEATION" } },
  },
  async (params, ctx) => {
    const parsed = DocSpecSchema.safeParse(params.docSpec);
    if (!parsed.success) {
      throw new OperationError(
        ErrorCode.INVALID_PARAMS,
        "docSpec failed schema validation",
        true,
        { issues: parsed.error.issues },
      );
    }

    const source = await resolveComponent(params.nodeId);
    const build = await buildDocPage(
      source,
      parsed.data,
      "agent",
      ctx.cancellation,
    );

    if (build.cancelled) {
      // The designer is who is left - the Bridge answered the caller when it
      // timed out - so the stopped run's account of itself is a toast.
      figma.notify(build.message, { timeout: 10_000 });
      return {
        cancelled: true,
        message: build.message,
        sourceComponentId: source.id,
      };
    }

    return { pageFrameId: build.root.id, sourceComponentId: source.id };
  },
);
