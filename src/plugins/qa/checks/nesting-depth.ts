/**
 * #14 — Easy to use (nested components). Flags exposed nested-instance
 * chains that surface too many levels of properties in the parent
 * configuration panel — the "messy right-hand panel" complaint from the PRD.
 *
 * Depth counts real panel levels: the exposing INSTANCE node itself is level
 * 1, and each further level of exposed nesting beneath it adds one more. A
 * component with deep internal nesting but nothing exposed passes — and so
 * does a container whose own `isExposedInstance` is false, however deep its
 * `exposedInstances` side-tree goes: an unexposed container's properties
 * (and everything beneath it) never reach the parent panel at all.
 *
 * `InstanceNode.exposedInstances` is flattened by Figma — every exposed
 * descendant at any depth, not just direct children — so the snapshot's flat
 * `exposedInstanceIds` per entry only encodes reachability, not direct
 * parentage. `directChildren` reconstructs the real tree: an id reachable
 * through another candidate's own id list is a grandchild (or deeper), not a
 * direct child, so it's excluded at this level and picked up when recursing
 * into that candidate instead.
 *
 * All variants of a set share one structure, so a chain repeated anywhere is
 * deduped to a single finding keyed on its path of names, with `count`
 * carrying how many times it occurs across the set (#100). The finding's
 * `nodeId` points at the first occurrence — "jump to offender" lands on one
 * representative instance of the chain, not all of them.
 *
 * Severity is always `warn`, never `fail` — this is an optimization
 * suggestion, not a correctness defect.
 */

import type {
  ComponentSetSnapshot,
  ExposedInstanceSnapshot,
  NodeSnapshot,
} from "../snapshot";
import type { CheckResult, Finding } from "../types";
import { NESTING_DEPTH_WARN_THRESHOLD } from "../qa-config";

interface Chain {
  /** Names from the exposing instance down to the leaf, e.g. ["Icon", "Fill"]. */
  path: string[];
  depth: number;
  /** Leaf exposed instance's node id, for "jump to offender". */
  nodeId: string;
}

/**
 * Given the full flat entry list and a candidate id set (subset of entries
 * reachable from the current point in the chain), returns the entries that
 * are direct children — i.e. not also reachable through another candidate.
 */
function directChildren(
  byId: Map<string, ExposedInstanceSnapshot>,
  candidateIds: readonly string[],
): ExposedInstanceSnapshot[] {
  const candidates = new Set(candidateIds);
  const reachableViaOther = new Set<string>();
  for (const id of candidateIds) {
    const entry = byId.get(id);
    if (!entry) continue;
    for (const descendantId of entry.exposedInstanceIds) {
      if (descendantId !== id && candidates.has(descendantId)) {
        reachableViaOther.add(descendantId);
      }
    }
  }
  return candidateIds
    .filter((id) => !reachableViaOther.has(id))
    .map((id) => byId.get(id))
    .filter((entry): entry is ExposedInstanceSnapshot => entry !== undefined);
}

function descend(
  byId: Map<string, ExposedInstanceSnapshot>,
  candidateIds: readonly string[],
  path: string[],
  parentNodeId: string,
  chains: Chain[],
): void {
  const children = directChildren(byId, candidateIds);
  if (children.length === 0) {
    // Exposure is documented as fully transitive (`InstanceNode.exposedInstances`
    // inherits downward), so every id here should resolve. If one doesn't —
    // stale snapshot, API surprise — report the chain as far as it's known
    // rather than silently dropping an already-established prefix.
    if (candidateIds.length > 0) {
      chains.push({ path, depth: path.length, nodeId: parentNodeId });
    }
    return;
  }
  for (const entry of children) {
    const here = [...path, entry.name];
    if (entry.exposedInstanceIds.length === 0) {
      chains.push({ path: here, depth: here.length, nodeId: entry.id });
    } else {
      descend(byId, entry.exposedInstanceIds, here, entry.id, chains);
    }
  }
}

function walk(node: NodeSnapshot, chains: Chain[]): void {
  // A container that isn't itself exposed to its parent's panel contributes
  // nothing there, however deep its own exposedInstances side-tree goes.
  if (
    node.isExposedInstance &&
    node.exposedInstances &&
    node.exposedInstances.length > 0
  ) {
    const byId = new Map(node.exposedInstances.map((e) => [e.id, e]));
    const topIds = node.exposedInstances.map((e) => e.id);
    descend(byId, topIds, [node.name], node.id, chains);
  }
  for (const child of node.children) {
    walk(child, chains);
  }
}

export function checkNestingDepth(
  snapshot: ComponentSetSnapshot,
): CheckResult {
  const byPath = new Map<string, { chain: Chain; count: number }>();

  for (const variant of snapshot.variants) {
    const chains: Chain[] = [];
    walk(variant.tree, chains);
    for (const chain of chains) {
      const key = chain.path.join(" > ");
      const existing = byPath.get(key);
      if (existing) {
        existing.count += 1;
      } else {
        byPath.set(key, { chain, count: 1 });
      }
    }
  }

  const findings: Finding[] = [];
  for (const { chain, count } of byPath.values()) {
    if (chain.depth <= NESTING_DEPTH_WARN_THRESHOLD) continue;
    const pathLabel = chain.path.join(" > ");
    findings.push({
      severity: "low",
      nodeId: chain.nodeId,
      nodeName: chain.path[chain.path.length - 1],
      message: `Exposed nested-instance chain "${pathLabel}" is ${chain.depth} levels deep, cluttering the parent configuration panel.`,
      expected: `at most ${NESTING_DEPTH_WARN_THRESHOLD} levels of exposed nested instances`,
      actual: `${chain.depth} levels`,
      count,
    });
  }

  findings.sort((a, b) => a.message.localeCompare(b.message));

  return {
    checkId: "nesting-depth",
    title: "Easy to use (nested components)",
    status: findings.length > 0 ? "warn" : "pass",
    findings,
  };
}
