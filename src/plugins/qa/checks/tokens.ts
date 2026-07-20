/**
 * #5 — Tokens (Styles & Variables). Enforces zero raw values on **visible
 * layers only** (hidden layers and `.`-prefixed layers, plus their subtrees,
 * are skipped):
 *
 *  - **Fills / strokes** must be bound to a color variable, else flagged. The
 *    untokenized-paint rule is re-applied verbatim from color-finder's scan
 *    (SOLID, visible, non-transparent, no `boundVariableId`) so the definition
 *    stays a single source of truth. Fully transparent fills and image /
 *    gradient fills are skipped; no fill is nothing to check.
 *  - **Typography** — TEXT layers must use a text style; a `MIXED` range is a
 *    `warn`, no style at all is a `fail`.
 *  - **Spacing** — non-zero padding / gap must be bound to spacing variables
 *    (`boundVariableKeys`); 0 is exempt.
 *  - **Effects** — checked only when an effect is present (`effectCount > 0`).
 *
 * Pure `(snapshot) → CheckResult`; no Figma API.
 */

import type {
  ComponentSetSnapshot,
  NodeSnapshot,
  PaintSnapshot,
} from "../snapshot";
import type { CheckResult, CheckStatus, Finding } from "../types";

/**
 * color-finder's untokenized-color rule (see `color-finder/utils/scan.ts`):
 * a paint is a raw value when it is SOLID, visible, non-transparent, and has no
 * bound color variable. Non-solid paints (image / gradient) and fully
 * transparent paints are not raw colors to tidy.
 */
function isUntokenizedPaint(paint: PaintSnapshot): boolean {
  return (
    paint.type === "SOLID" &&
    paint.visible !== false &&
    paint.opacity > 0 &&
    !paint.boundVariableId
  );
}

/** Padding / gap fields whose keys appear verbatim in `boundVariableKeys`. */
const SPACING_FIELDS = [
  "paddingTop",
  "paddingRight",
  "paddingBottom",
  "paddingLeft",
  "itemSpacing",
] as const;

export function checkTokens(snapshot: ComponentSetSnapshot): CheckResult {
  const findings: Finding[] = [];
  let hasHard = false;
  let hasWarn = false;

  const flag = (finding: Finding, hard: boolean): void => {
    findings.push(finding);
    if (hard) hasHard = true;
    else hasWarn = true;
  };

  for (const variant of snapshot.variants) {
    walkVisible(variant.tree, (node) => inspect(node, flag));
  }

  const status: CheckStatus = hasHard ? "fail" : hasWarn ? "warn" : "pass";
  return {
    checkId: "tokens",
    title: "Tokens (Styles & Variables)",
    status,
    findings,
  };
}

/**
 * Depth-first over the tree, visiting visible layers only. A hidden layer or a
 * `.`-prefixed layer (Figma's convention for scaffolding) is skipped together
 * with its entire subtree.
 */
function walkVisible(
  node: NodeSnapshot,
  visit: (node: NodeSnapshot) => void,
): void {
  if (node.visible === false) return;
  if (node.name.startsWith(".")) return;
  visit(node);
  for (const child of node.children) walkVisible(child, visit);
}

function inspect(
  node: NodeSnapshot,
  flag: (finding: Finding, hard: boolean) => void,
): void {
  // Fills / strokes — raw color values.
  for (const paint of node.fills ?? []) {
    if (isUntokenizedPaint(paint)) {
      flag(rawPaintFinding(node, paint, "Fill"), true);
    }
  }
  for (const paint of node.strokes ?? []) {
    if (isUntokenizedPaint(paint)) {
      flag(rawPaintFinding(node, paint, "Stroke"), true);
    }
  }

  // Typography — text layers must carry a text style.
  if (node.type === "TEXT") {
    if (node.textStyleId === "MIXED") {
      flag(
        {
          severity: "low",
          nodeId: node.id,
          nodeName: node.name,
          message: `Text layer "${node.name}" has mixed text styles across its ranges.`,
          expected: "A single text style applied to the whole layer",
          actual: "MIXED",
        },
        false,
      );
    } else if (!node.textStyleId) {
      flag(
        {
          severity: "high",
          nodeId: node.id,
          nodeName: node.name,
          message: `Text layer "${node.name}" does not use a text style.`,
          expected: "A text style bound to the layer",
          actual: "unstyled",
        },
        true,
      );
    }
  }

  // Spacing — non-zero padding / gap must be bound to spacing variables.
  const bound = new Set(node.boundVariableKeys ?? []);
  for (const field of SPACING_FIELDS) {
    const value = node[field];
    if (typeof value === "number" && value !== 0 && !bound.has(field)) {
      flag(
        {
          severity: "medium",
          nodeId: node.id,
          nodeName: node.name,
          message: `"${node.name}" ${field} is ${value} but not bound to a spacing variable.`,
          expected: "Spacing bound to a variable",
          actual: String(value),
        },
        true,
      );
    }
  }

  // Effects — only when an effect is present.
  if ((node.effectCount ?? 0) > 0 && !node.effectStyleId) {
    flag(
      {
        severity: "medium",
        nodeId: node.id,
        nodeName: node.name,
        message: `"${node.name}" has an effect that does not use an effect style.`,
        expected: "An effect style applied to the layer",
        actual: "unstyled effect",
      },
      true,
    );
  }
}

function rawPaintFinding(
  node: NodeSnapshot,
  paint: PaintSnapshot,
  kind: "Fill" | "Stroke",
): Finding {
  const value = paint.hex ?? "raw color";
  return {
    severity: "high",
    nodeId: node.id,
    nodeName: node.name,
    message: `${kind} ${value} on "${node.name}" is a raw value, not bound to a color variable.`,
    expected: "A color bound to a variable",
    actual: value,
  };
}
