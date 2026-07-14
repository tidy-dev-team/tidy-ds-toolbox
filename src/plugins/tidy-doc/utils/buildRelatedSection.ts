/// <reference types="@figma/plugin-typings" />

// Related Components Section (CONTEXT.md "Related-component candidates…"):
// one block per authored `related` key, each with authored guidance and a
// live specimen instance of the resolved sibling, rendered in candidate-rank
// order (facts.relatedCandidates — resolveReferences already rejected any
// key that isn't a real candidate before this runs).

import { buildAutoLayoutFrame } from "../../sticker-sheet-builder/utils/utilityFunctions";
import { createText, FONT_BOLD, TOKENS } from "./buildChrome";
import { createSpecimenInstance } from "./specimenFactory";
import { ErrorCode, OperationError } from "../../../shared/operations/errors";
import type { DocSpec } from "./docSpec";
import type { DerivedFacts } from "./facts";

/**
 * One-shot file-wide scan to resolve all authored sibling names at once,
 * rather than re-running loadAllPagesAsync + findAllWithCriteria per key
 * (N related entries → N+1 full-tree traversals).
 */
async function resolveAllSiblings(
  names: string[],
): Promise<Map<string, ComponentNode | ComponentSetNode>> {
  await figma.loadAllPagesAsync();
  const result = new Map<string, ComponentNode | ComponentSetNode>();
  for (const node of figma.root.findAllWithCriteria({
    types: ["COMPONENT_SET", "COMPONENT"],
  })) {
    // Skip variant children of component sets — only top-level peers
    // are valid resolved siblings.
    if (node.parent?.type === "COMPONENT_SET") continue;
    if (names.includes(node.name)) {
      result.set(node.name, node);
    }
  }
  return result;
}

// The sibling was never `deriveFacts`'d (it isn't the doc's own source), so
// there's no DerivedFacts to route family/state pinning through — pin its
// own default-variant properties directly via exact-match overrides,
// giving a neutral designer-intended appearance rather than un-pinned/
// arbitrary defaults.
function createRelatedSpecimenInstance(
  sibling: ComponentNode | ComponentSetNode,
): InstanceNode {
  const overrides =
    sibling.type === "COMPONENT_SET"
      ? (sibling.defaultVariant?.variantProperties ?? {})
      : {};
  return createSpecimenInstance(sibling, { overrides });
}

// Pure skip predicate (#72) — whether there are any authored `related` keys
// to render.
export function appliesRelatedSection(spec: DocSpec): boolean {
  const related = spec.related;
  return !!related && Object.keys(related).length > 0;
}

export async function buildRelatedSection(
  spec: DocSpec,
  facts: DerivedFacts,
): Promise<FrameNode> {
  const related = spec.related!;

  const section = buildAutoLayoutFrame("related-section", "VERTICAL", 0, 0, 24);

  const orderedNames = facts.relatedCandidates
    .map((candidate) => candidate.name)
    .filter((name) => Object.prototype.hasOwnProperty.call(related, name));

  const siblingsByName = await resolveAllSiblings(orderedNames);

  for (const name of orderedNames) {
    const content = related[name];
    const block = buildAutoLayoutFrame(
      `related — ${name}`,
      "VERTICAL",
      0,
      0,
      8,
    );

    const title = await createText(name, 14, FONT_BOLD);
    const guidance = await createText(
      content.guidance,
      12,
      undefined,
      TOKENS.mutedDark,
    );
    block.appendChild(title);
    block.appendChild(guidance);

    const sibling = siblingsByName.get(name);
    if (!sibling) {
      throw new OperationError(
        ErrorCode.NOT_FOUND,
        `related sibling "${name}" resolved against derived facts but no longer exists in the file`,
        true,
        { name },
      );
    }
    const specimen = createRelatedSpecimenInstance(sibling);
    block.appendChild(specimen);

    section.appendChild(block);
  }

  return section;
}
