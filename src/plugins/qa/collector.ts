/// <reference types="@figma/plugin-typings" />

/**
 * Snapshot collector — the ONLY part of the QA engine that touches `figma.*`.
 * Walks a resolved component set once and produces the plain serializable
 * snapshot the pure check functions run against (issue #76).
 */

import type {
  ComponentPropertySnapshot,
  ComponentSetSnapshot,
  NodeSnapshot,
  PaintSnapshot,
  VariantSnapshot,
} from "./snapshot";

function toHex(color: RGB): string {
  const channel = (v: number) =>
    Math.round(v * 255)
      .toString(16)
      .padStart(2, "0")
      .toUpperCase();
  return `#${channel(color.r)}${channel(color.g)}${channel(color.b)}`;
}

function snapshotPaints(
  paints: readonly Paint[] | typeof figma.mixed,
): PaintSnapshot[] | undefined {
  if (paints === figma.mixed) return undefined;
  return paints.map((paint) => ({
    type: paint.type,
    visible: paint.visible !== false,
    opacity: paint.opacity ?? 1,
    ...(paint.type === "SOLID" ? { hex: toHex(paint.color) } : {}),
    ...(paint.type === "SOLID" && paint.boundVariables?.color
      ? { boundVariableId: paint.boundVariables.color.id }
      : {}),
  }));
}

function styleId(value: string | typeof figma.mixed): string {
  return value === figma.mixed ? "MIXED" : value;
}

function snapshotNode(node: SceneNode): NodeSnapshot {
  const snap: NodeSnapshot = {
    id: node.id,
    name: node.name,
    type: node.type,
    visible: node.visible,
    width: "width" in node ? node.width : 0,
    height: "height" in node ? node.height : 0,
    children: [],
  };

  if (node.type === "INSTANCE") {
    // Interiors of nested instances are deliberately not collected — their
    // guts belong to the source component (#8 handles provenance).
    snap.mainComponentId = node.mainComponent?.id;
  } else if ("children" in node) {
    snap.children = node.children.map(snapshotNode);
  }

  if ("fills" in node) {
    const fills = snapshotPaints(node.fills);
    if (fills) snap.fills = fills;
    snap.fillStyleId = styleId(node.fillStyleId);
  }
  if ("strokes" in node) {
    snap.strokes = snapshotPaints(node.strokes);
    snap.strokeStyleId = styleId(node.strokeStyleId);
  }
  if (node.type === "TEXT") {
    snap.textStyleId = styleId(node.textStyleId);
  }
  if ("effects" in node) {
    snap.effectCount = node.effects.length;
    snap.effectStyleId = node.effectStyleId;
  }

  if ("layoutMode" in node) {
    snap.layoutMode = node.layoutMode;
    snap.paddingTop = node.paddingTop;
    snap.paddingRight = node.paddingRight;
    snap.paddingBottom = node.paddingBottom;
    snap.paddingLeft = node.paddingLeft;
    snap.itemSpacing = node.itemSpacing;
  }
  if ("layoutSizingHorizontal" in node) {
    snap.layoutSizingHorizontal = node.layoutSizingHorizontal;
    snap.layoutSizingVertical = node.layoutSizingVertical;
  }
  if ("cornerRadius" in node) {
    snap.cornerRadius =
      node.cornerRadius === figma.mixed ? "MIXED" : node.cornerRadius;
  }
  if ("strokeWeight" in node) {
    snap.strokeWeight =
      node.strokeWeight === figma.mixed ? "MIXED" : node.strokeWeight;
  }

  if ("boundVariables" in node && node.boundVariables) {
    const keys = Object.keys(node.boundVariables).filter(
      (key) =>
        (node.boundVariables as Record<string, unknown>)[key] !== undefined,
    );
    if (keys.length > 0) snap.boundVariableKeys = keys;
  }

  if ("reactions" in node && node.reactions.length > 0) {
    snap.reactionTriggers = node.reactions.flatMap((r) =>
      r.trigger?.type ? [r.trigger.type as string] : [],
    );
  }

  return snap;
}

/** Strip Figma's "#id" suffix from non-variant component property names. */
function propertyDisplayName(rawName: string): string {
  const hashIdx = rawName.lastIndexOf("#");
  return hashIdx > 0 ? rawName.slice(0, hashIdx) : rawName;
}

function snapshotProperties(
  subject: ComponentSetNode | ComponentNode,
): ComponentPropertySnapshot[] {
  let definitions: ComponentPropertyDefinitions;
  try {
    definitions = subject.componentPropertyDefinitions;
  } catch {
    // Variant children of a set throw; standalone components without props
    // simply return {}.
    return [];
  }
  return Object.entries(definitions).map(([rawName, def]) => ({
    name: propertyDisplayName(rawName),
    type: def.type,
    ...(def.type === "INSTANCE_SWAP"
      ? { preferredValuesCount: def.preferredValues?.length ?? 0 }
      : {}),
  }));
}

/**
 * Collect the snapshot for a component set or standalone component.
 * Static — reads only, never mutates the file.
 */
export function collectSnapshot(
  subject: ComponentSetNode | ComponentNode,
): ComponentSetSnapshot {
  const variantNodes: ComponentNode[] =
    subject.type === "COMPONENT_SET"
      ? subject.children.filter(
          (child): child is ComponentNode => child.type === "COMPONENT",
        )
      : [subject];

  const variants: VariantSnapshot[] = variantNodes.map((variant) => ({
    id: variant.id,
    name: variant.name,
    variantProperties:
      subject.type === "COMPONENT_SET" ? (variant.variantProperties ?? {}) : {},
    tree: snapshotNode(variant),
  }));

  const properties = snapshotProperties(subject);

  return {
    id: subject.id,
    name: subject.name,
    type: subject.type,
    description: subject.description,
    propertyNames: properties.map((p) => p.name),
    properties,
    variants,
  };
}
