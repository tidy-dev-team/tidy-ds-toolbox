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
interface BuildPageResult {
  pageFrameId: string;
  sourceComponentId: string;
}

registerOperation<BuildPageParams, BuildPageResult>(
  {
    id: "tidy_doc_build_page",
    kind: "execute",
    module: "tidy-doc",
    summary:
      "Build (or replace) a Documentation Page next to the source component: Chrome (status badge) + a Variants Section with one specimen per keyed family. Re-running replaces the prior page for the same source. Rejects unresolved family-value references in a single batched error.",
    paramsExample: { docSpec: { status: "IDEATION" } },
  },
  async (params) => {
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
    const root = await buildDocPage(source, parsed.data);

    return { pageFrameId: root.id, sourceComponentId: source.id };
  },
);
