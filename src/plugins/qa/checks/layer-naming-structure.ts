/**
 * #9 — layer naming + structure. Two sub-checks over each variant tree:
 *
 *  (a) Name cleanliness — reject default Figma names (`Frame 1204`, `Group 2`,
 *      `Vector 4`, …) via DEFAULT_LAYER_NAME_PATTERN. Nested instance interiors
 *      are never inspected: they are absent from the snapshot by design (#8),
 *      and the walk explicitly stops at INSTANCE boundaries.
 *
 *  (b) Structural redundancy — flag a wrapper with exactly one child, no fill,
 *      no stroke, no effect, zero padding, and layout mode/sizing identical to
 *      that child. Any padding, background, stroke, effect, or differing layout
 *      axis means the wrapper is doing work and is NOT redundant.
 *
 * Both violations are warnings.
 */

import type { ComponentSetSnapshot, NodeSnapshot } from "../snapshot";
import type { CheckResult, Finding } from "../types";
import { DEFAULT_LAYER_NAME_PATTERN } from "../qa-config";

function hasVisibleFill(node: NodeSnapshot): boolean {
  return (node.fills ?? []).some((p) => p.visible);
}

function hasVisibleStroke(node: NodeSnapshot): boolean {
  return (node.strokes ?? []).some((p) => p.visible);
}

function hasEffect(node: NodeSnapshot): boolean {
  return (node.effectCount ?? 0) > 0;
}

function hasPadding(node: NodeSnapshot): boolean {
  return (
    (node.paddingTop ?? 0) > 0 ||
    (node.paddingRight ?? 0) > 0 ||
    (node.paddingBottom ?? 0) > 0 ||
    (node.paddingLeft ?? 0) > 0
  );
}

function sameLayout(a: NodeSnapshot, b: NodeSnapshot): boolean {
  return (
    a.layoutMode === b.layoutMode &&
    a.layoutSizingHorizontal === b.layoutSizingHorizontal &&
    a.layoutSizingVertical === b.layoutSizingVertical
  );
}

/** A wrapper that adds nothing but a layer of nesting. */
function isRedundantWrapper(node: NodeSnapshot): boolean {
  if (node.type === "INSTANCE") return false;
  if (node.children.length !== 1) return false;
  if (
    hasVisibleFill(node) ||
    hasVisibleStroke(node) ||
    hasEffect(node) ||
    hasPadding(node)
  ) {
    return false;
  }
  return sameLayout(node, node.children[0]);
}

export function checkLayerNamingStructure(
  snapshot: ComponentSetSnapshot,
): CheckResult {
  const findings: Finding[] = [];

  const visit = (node: NodeSnapshot): void => {
    if (DEFAULT_LAYER_NAME_PATTERN.test(node.name)) {
      findings.push({
        severity: "low",
        nodeId: node.id,
        nodeName: node.name,
        message: `Layer "${node.name}" uses a default Figma name.`,
        expected: "a descriptive, intentional layer name",
        actual: node.name,
      });
    }

    if (isRedundantWrapper(node)) {
      findings.push({
        severity: "low",
        nodeId: node.id,
        nodeName: node.name,
        message: `Layer "${node.name}" is a redundant single-child wrapper (no fill, stroke, effect, or padding, and the same layout as its only child).`,
        suggestedFix: "Remove the wrapper and promote its child in its place.",
      });
    }

    // Never descend into nested instance interiors (#8 owns provenance).
    if (node.type === "INSTANCE") return;
    for (const child of node.children) visit(child);
  };

  for (const variant of snapshot.variants) {
    visit(variant.tree);
  }

  return {
    checkId: "layer-naming-structure",
    title: "Layer naming + structure",
    status: findings.length > 0 ? "warn" : "pass",
    findings,
  };
}
