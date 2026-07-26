/**
 * Which variables a snapshot consumes, and where - the one traversal shared by
 * the #17 probe (which needs the id set to resolve) and the #17 check (which
 * needs usage counts and a representative node per variable). Pure, so it lives
 * outside the collector and is testable from fixtures.
 */

import type { ComponentSetSnapshot, NodeSnapshot } from "./snapshot";

export interface VariableUsage {
  /**
   * How many consuming sites reference this variable: layers that bind it,
   * plus component properties bound to it.
   * Counted once per site rather than once per binding, because a paint alias
   * appears twice in the snapshot (on the paint and in the node's
   * `boundVariables.fills`), and one layer using one variable is one thing to
   * fix either way.
   */
  count: number;
  /** First binding site - the representative node for "jump to offender". */
  nodeId: string;
  nodeName: string;
}

/** Variable id → usage, in first-seen order. */
export function collectVariableUsage(
  snapshot: ComponentSetSnapshot,
): Map<string, VariableUsage> {
  const usage = new Map<string, VariableUsage>();

  const bump = (id: string, site: { id: string; name: string }) => {
    const existing = usage.get(id);
    if (existing) {
      existing.count += 1;
    } else {
      usage.set(id, { count: 1, nodeId: site.id, nodeName: site.name });
    }
  };

  function visit(node: NodeSnapshot): void {
    // Deduped per layer first: a paint-bound variable is recorded both on the
    // paint and in the node's own `boundVariables.fills`, so counting each
    // occurrence would double every paint binding.
    const here = new Set<string>();
    for (const paint of [...(node.fills ?? []), ...(node.strokes ?? [])]) {
      if (paint.boundVariableId) here.add(paint.boundVariableId);
    }
    for (const id of node.boundVariableIds ?? []) here.add(id);
    for (const id of here) bump(id, node);
    for (const child of node.children) visit(child);
  }

  for (const variant of snapshot.variants) visit(variant.tree);

  // Component properties bind variables too, and those bindings belong to the
  // set rather than to any layer, so the set is their representative site.
  for (const property of snapshot.properties) {
    for (const id of property.boundVariableIds ?? []) {
      bump(id, { id: snapshot.id, name: snapshot.name });
    }
  }

  return usage;
}

/**
 * Nodes pinning an explicit mode **for `collectionId`**. Only that collection
 * matters: a node pinning a density or unit mode says nothing about whether the
 * theme resolved correctly, so counting it would raise the #17 caveat on
 * components whose theme results are perfectly verifiable.
 */
export function nodesPinning(
  snapshot: ComponentSetSnapshot,
  collectionId: string,
): { id: string; name: string }[] {
  const pinned: { id: string; name: string }[] = [];

  function visit(node: NodeSnapshot): void {
    if (node.explicitVariableModes?.[collectionId] !== undefined) {
      pinned.push({ id: node.id, name: node.name });
    }
    for (const child of node.children) visit(child);
  }

  // The ancestry first: a pin on the set, or on a frame or page containing it,
  // sets the mode context for every variant below it.
  for (const ancestor of snapshot.pinnedAncestors ?? []) {
    if (ancestor.explicitVariableModes[collectionId] !== undefined) {
      pinned.push({ id: ancestor.id, name: ancestor.name });
    }
  }
  for (const variant of snapshot.variants) visit(variant.tree);
  return pinned;
}
