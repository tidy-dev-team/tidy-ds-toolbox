/// <reference types="@figma/plugin-typings" />

// Figma-touching adapter: file-wide token-overlap scan for Related-component
// candidates (CONTEXT.md "Related-component candidates…"). Excludes the
// source's own family (itself + sibling variants in the same component set)
// and its building blocks (components reachable as nested instances inside
// it, resolved via findAllWithCriteria(['INSTANCE']) + getMainComponentAsync
// per component). No dependency on the ds-explorer registry — works over any
// client file. Not unit tested — Figma-API adapter; the pure ranking core is
// tested in rankRelatedCandidates.test.ts.

import {
  DEFAULT_RELATED_CANDIDATES_CAP,
  rankRelatedCandidates,
  type RelatedCandidate,
} from "./rankRelatedCandidates";

async function collectBuildingBlockNames(
  source: ComponentNode | ComponentSetNode,
): Promise<string[]> {
  const names: string[] = [];
  const instances = source.findAllWithCriteria({ types: ["INSTANCE"] });
  for (const instance of instances) {
    const main = await instance.getMainComponentAsync();
    if (!main) continue;
    names.push(main.name);
    if (main.parent?.type === "COMPONENT_SET") {
      names.push(main.parent.name);
    }
  }
  return names;
}

function collectOwnFamilyNames(
  source: ComponentNode | ComponentSetNode,
): string[] {
  if (source.type === "COMPONENT_SET") {
    return source.children.map((child) => child.name);
  }
  if (source.parent?.type === "COMPONENT_SET") {
    return [source.parent.name, ...source.parent.children.map((c) => c.name)];
  }
  return [];
}

export async function findRelatedCandidates(
  source: ComponentNode | ComponentSetNode,
  cap: number = DEFAULT_RELATED_CANDIDATES_CAP,
): Promise<RelatedCandidate[]> {
  const excludeNames = new Set<string>([
    source.name,
    ...collectOwnFamilyNames(source),
    ...(await collectBuildingBlockNames(source)),
  ]);

  await figma.loadAllPagesAsync();
  const allNames = figma.root
    .findAllWithCriteria({ types: ["COMPONENT_SET", "COMPONENT"] })
    // Exclude variant children of component sets — findAllWithCriteria
    // matches every nested component, but related-candidate ranking is
    // about top-level peers, not internal variant children.
    .filter((node) => node.parent?.type !== "COMPONENT_SET")
    .map((node) => node.name);

  return rankRelatedCandidates(source.name, allNames, excludeNames, cap);
}
