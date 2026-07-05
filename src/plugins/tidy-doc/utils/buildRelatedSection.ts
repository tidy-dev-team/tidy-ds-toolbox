/// <reference types="@figma/plugin-typings" />

// Related Components Section (CONTEXT.md "Related-component candidates…"):
// one block per authored `related` key, each with authored guidance and a
// live specimen instance of the resolved sibling, rendered in candidate-rank
// order (facts.relatedCandidates — resolveReferences already rejected any
// key that isn't a real candidate before this runs).

import { buildAutoLayoutFrame } from "../../sticker-sheet-builder/utils/utilityFunctions";
import { createText } from "./buildChrome";
import { ErrorCode, OperationError } from "../../../shared/operations/errors";
import type { DocSpec } from "./docSpec";
import type { DerivedFacts } from "./facts";

async function findSiblingByName(
  name: string,
): Promise<ComponentNode | ComponentSetNode> {
  await figma.loadAllPagesAsync();
  const match = figma.root
    .findAllWithCriteria({ types: ["COMPONENT_SET", "COMPONENT"] })
    .find((node) => node.name === name);
  if (!match) {
    throw new OperationError(
      ErrorCode.NOT_FOUND,
      `related sibling "${name}" resolved against derived facts but no longer exists in the file`,
      true,
      { name },
    );
  }
  return match;
}

function createSpecimenInstance(sibling: ComponentNode | ComponentSetNode): InstanceNode {
  const base = sibling.type === "COMPONENT_SET" ? sibling.defaultVariant : sibling;
  return base.createInstance();
}

export async function buildRelatedSection(
  spec: DocSpec,
  facts: DerivedFacts,
): Promise<FrameNode | null> {
  const related = spec.related;
  if (!related || Object.keys(related).length === 0) return null;

  const section = buildAutoLayoutFrame("related-section", "VERTICAL", 0, 0, 24);

  const orderedNames = facts.relatedCandidates
    .map((candidate) => candidate.name)
    .filter((name) => Object.prototype.hasOwnProperty.call(related, name));

  for (const name of orderedNames) {
    const content = related[name];
    const block = buildAutoLayoutFrame(`related — ${name}`, "VERTICAL", 0, 0, 8);

    const title = await createText(name, 14, { family: "Inter", style: "Bold" });
    const guidance = await createText(content.guidance, 12, undefined, "#4B5563");
    block.appendChild(title);
    block.appendChild(guidance);

    const sibling = await findSiblingByName(name);
    const specimen = createSpecimenInstance(sibling);
    block.appendChild(specimen);

    section.appendChild(block);
  }

  return section;
}
