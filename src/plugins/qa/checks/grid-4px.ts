/**
 * #10 — 4px grid alignment. Audits width, height, all four paddings, item
 * gap, corner radius, and stroke weight against `isOnGrid` (qa-config.ts):
 * a multiple of 4, or exactly 2. Applied uniformly.
 *
 * Only *fixed* dimensions are grid-checked — width is exempt when
 * `layoutSizingHorizontal` is Hug/Fill, height likewise for vertical sizing.
 * MIXED corner radius / stroke weight are skipped rather than flagged.
 * Off-grid → warn severity (legit optical exceptions exist).
 */

import type { ComponentSetSnapshot, NodeSnapshot } from "../snapshot";
import type { CheckResult, Finding } from "../types";
import { isOnGrid } from "../qa-config";

function offGridFinding(
  node: NodeSnapshot,
  field: string,
  value: number,
): Finding {
  return {
    severity: "low",
    nodeId: node.id,
    nodeName: node.name,
    message: `${field} (${value}) on "${node.name}" is off the 4px grid.`,
    expected: "a multiple of 4, or exactly 2",
    actual: String(value),
  };
}

function checkField(
  node: NodeSnapshot,
  field: string,
  value: number | "MIXED" | undefined,
): Finding | null {
  if (value === undefined || value === "MIXED") return null;
  return isOnGrid(value) ? null : offGridFinding(node, field, value);
}

function walk(node: NodeSnapshot, findings: Finding[]): void {
  const widthExempt =
    node.layoutSizingHorizontal === "HUG" ||
    node.layoutSizingHorizontal === "FILL";
  const heightExempt =
    node.layoutSizingVertical === "HUG" || node.layoutSizingVertical === "FILL";

  if (!widthExempt) {
    const finding = checkField(node, "width", node.width);
    if (finding) findings.push(finding);
  }
  if (!heightExempt) {
    const finding = checkField(node, "height", node.height);
    if (finding) findings.push(finding);
  }

  const fields: Array<[string, number | "MIXED" | undefined]> = [
    ["paddingTop", node.paddingTop],
    ["paddingRight", node.paddingRight],
    ["paddingBottom", node.paddingBottom],
    ["paddingLeft", node.paddingLeft],
    ["itemSpacing", node.itemSpacing],
    ["cornerRadius", node.cornerRadius],
    ["strokeWeight", node.strokeWeight],
  ];

  for (const [field, value] of fields) {
    const finding = checkField(node, field, value);
    if (finding) findings.push(finding);
  }

  for (const child of node.children) {
    walk(child, findings);
  }
}

export function checkGrid4px(snapshot: ComponentSetSnapshot): CheckResult {
  const findings: Finding[] = [];
  for (const variant of snapshot.variants) {
    walk(variant.tree, findings);
  }

  return {
    checkId: "grid-4px",
    title: "4px grid alignment",
    status: findings.length > 0 ? "warn" : "pass",
    findings,
  };
}
