/**
 * #11 — prototype reactions on a component set's variant nodes may only
 * trigger `ON_HOVER`. Any other trigger (click, press, mouse down/up, drag,
 * timeout, key) is a fail.
 *
 * The item only applies to a set that **declares a hover state** (design,
 * 2026-08-04: _"dont check it if there is not any hover state at all in the
 * component property"_). A set with no hover state is skipped as
 * `not_applicable` even when it carries reactions.
 *
 * That gate is wider than the old one, which asked only whether any reaction
 * existed, and it can now swallow a real defect: a click reaction on a set with
 * no hover state used to fail and is now skipped. That is the rule as design
 * stated it, so the skip note names the reason rather than staying silent —
 * a reader seeing "no hover state, so triggers were not checked" can tell the
 * row was declined, which a bare grey chip would not convey.
 */

import type { ComponentSetSnapshot, NodeSnapshot } from "../snapshot";
import type { CheckResult, Finding } from "../types";
import { ALLOWED_TRIGGER_TYPES, HOVER_STATE_VALUE } from "../qa-config";

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

/**
 * Whether the set declares a hover state at all.
 *
 * Read off the variants' property *values*, not the property definitions:
 * `ComponentSetSnapshot.properties` carries each definition's name, key and
 * type but not its options, so the set of legal values for `State` exists in
 * the snapshot only as the values its variants actually take.
 *
 * The property name is not constrained on purpose. `State=hover` is the shape
 * in this file, but the same state is spelled under other property names
 * elsewhere, and matching the value is what survives that.
 */
function declaresHoverState(snapshot: ComponentSetSnapshot): boolean {
  return snapshot.variants.some((variant) =>
    Object.values(variant.variantProperties).some(
      (value) => value.trim().toLowerCase() === HOVER_STATE_VALUE,
    ),
  );
}

export function checkInteractionHoverOnly(
  snapshot: ComponentSetSnapshot,
): CheckResult {
  if (!declaresHoverState(snapshot)) {
    return {
      checkId: "interaction-hover-only",
      title: "Interaction (hover-only)",
      status: "not_applicable",
      note: "This set declares no hover state, so its prototype triggers were not checked.",
      findings: [],
    };
  }

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
    status: !sawReaction
      ? "not_applicable"
      : findings.length > 0
        ? "fail"
        : "pass",
    ...(sawReaction
      ? {}
      : {
          note: "This set declares a hover state but carries no prototype reaction, so there is no trigger to check.",
        }),
    findings,
  };
}
