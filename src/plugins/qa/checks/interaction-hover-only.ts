/**
 * #11 — prototype reactions on a component set's variant nodes may only
 * trigger `ON_HOVER`. Any other trigger (click, press, mouse down/up, drag,
 * timeout, key) is a fail. No reactions anywhere → not_applicable.
 */

import type { ComponentSetSnapshot, NodeSnapshot } from "../snapshot";
import type { CheckResult, Finding } from "../types";
import { ALLOWED_TRIGGER_TYPES } from "../qa-config";

function collectFindings(node: NodeSnapshot, findings: Finding[]): boolean {
  let sawReaction = false;
  const triggers = node.reactionTriggers ?? [];
  if (triggers.length > 0) {
    sawReaction = true;
    const disallowed = triggers.filter(
      (trigger) => !ALLOWED_TRIGGER_TYPES.includes(trigger),
    );
    if (disallowed.length > 0) {
      findings.push({
        severity: "medium",
        nodeId: node.id,
        nodeName: node.name,
        message: `Node "${node.name}" has non-hover prototype trigger(s): ${disallowed.join(", ")}.`,
        expected: "ON_HOVER only",
        actual: triggers.join(", "),
      });
    }
  }
  for (const child of node.children) {
    if (collectFindings(child, findings)) {
      sawReaction = true;
    }
  }
  return sawReaction;
}

export function checkInteractionHoverOnly(
  snapshot: ComponentSetSnapshot,
): CheckResult {
  const findings: Finding[] = [];
  let sawReaction = false;

  for (const variant of snapshot.variants) {
    if (collectFindings(variant.tree, findings)) {
      sawReaction = true;
    }
  }

  return {
    checkId: "interaction-hover-only",
    title: "Interaction (hover-only)",
    status: !sawReaction ? "not_applicable" : findings.length > 0 ? "fail" : "pass",
    findings,
  };
}
