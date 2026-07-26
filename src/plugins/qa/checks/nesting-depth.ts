/**
 * #14 — Easy to use (nested components). Flags exposed nested-instance
 * chains that surface too many levels of properties in the parent
 * configuration panel — the "messy right-hand panel" complaint from the PRD.
 *
 * Depth is the chain length of *exposed* nested instances
 * (`InstanceNode.exposedInstances`, walked recursively via the snapshot's
 * `exposedInstances` side-tree) — not raw instance-tree depth. A component
 * with deep internal nesting but nothing exposed passes.
 *
 * All variants of a set share one structure, so a chain repeated across
 * variants is deduped to a single finding keyed on its path of names, with
 * `count` carrying how many variants it was seen on (#100). The finding's
 * `nodeId` points at the first variant's occurrence — "jump to offender"
 * lands on one representative instance of the chain, not all of them.
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

function collectChains(
  root: ExposedInstanceSnapshot,
  path: string[],
  chains: Chain[],
): void {
  const here = [...path, root.name];
  if (root.exposedInstances.length === 0) {
    chains.push({ path: here, depth: here.length, nodeId: root.id });
    return;
  }
  for (const child of root.exposedInstances) {
    collectChains(child, here, chains);
  }
}

function walk(node: NodeSnapshot, chains: Chain[]): void {
  if (node.exposedInstances) {
    for (const exposed of node.exposedInstances) {
      collectChains(exposed, [], chains);
    }
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
