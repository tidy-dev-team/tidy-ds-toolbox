/// <reference types="@figma/plugin-typings" />

/**
 * Snapshot collector — the ONLY part of the QA engine that touches `figma.*`.
 * Walks a resolved component set once and produces the plain serializable
 * snapshot the pure check functions run against (issue #76).
 */

import { toHex } from "./color";
import type {
  ComponentPropertySnapshot,
  PinnedAncestorSnapshot,
  ComponentSetSnapshot,
  ExposedInstanceSnapshot,
  NodeSnapshot,
  PaintSnapshot,
  VariantSnapshot,
} from "./snapshot";

// Flat, one level deep: `instance.exposedInstances` is already Figma's full
// flattened descendant list, so recursing into each entry's own
// `.exposedInstances` here would re-serialize the same descendants under
// every ancestor. Only each entry's own id list is captured — enough for the
// pure check to reconstruct direct-child relations via set subtraction.
function snapshotExposedInstance(
  instance: InstanceNode,
): ExposedInstanceSnapshot {
  return {
    id: instance.id,
    name: instance.name,
    exposedInstanceIds: instance.exposedInstances.map((e) => e.id),
  };
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

/**
 * Unwrap one entry of a `boundVariables` record into the aliases it holds.
 * The record mixes three shapes: `VariableAlias` for scalar fields such as
 * `paddingLeft`, `VariableAlias[]` for `fills` / `strokes` / `effects` /
 * text-range fields, and `{ [propertyName]: VariableAlias }` for
 * `componentProperties`.
 */
function variableAliases(binding: unknown): VariableAlias[] {
  if (!binding || typeof binding !== "object") return [];
  if (Array.isArray(binding)) return binding as VariableAlias[];
  if (typeof (binding as VariableAlias).id === "string") {
    return [binding as VariableAlias];
  }
  // componentProperties: keyed by property name, one alias each.
  return Object.values(binding as Record<string, VariableAlias>).filter(
    (alias): alias is VariableAlias => typeof alias?.id === "string",
  );
}

/**
 * The subject plus every ancestor that pins explicit variable modes (#17).
 * A pin on the component set, or on a frame or page containing it, sets the
 * mode context for every descendant, so the probe (which resolves against a
 * frame with only its own pin) cannot speak for those nodes. Walking the
 * ancestry is the only way to see it: the snapshot's node trees start at the
 * variants, below any of this.
 */
function collectPinnedAncestors(
  subject: ComponentSetNode | ComponentNode,
): PinnedAncestorSnapshot[] {
  const pinned: PinnedAncestorSnapshot[] = [];
  let current: BaseNode | null = subject;
  while (current) {
    if ("explicitVariableModes" in current) {
      const modes = current.explicitVariableModes;
      if (Object.keys(modes).length > 0) {
        pinned.push({
          id: current.id,
          name: current.name,
          explicitVariableModes: { ...modes },
        });
      }
    }
    current = current.parent;
  }
  return pinned;
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
    // guts belong to the source component (#8 judges provenance from the main
    // component's identity alone). Only the exposed-instance side-tree is
    // captured (#14 nesting depth).
    const main = node.mainComponent;
    if (main) {
      const set = main.parent?.type === "COMPONENT_SET" ? main.parent : null;
      snap.mainComponent = {
        id: main.id,
        key: main.key,
        name: main.name,
        ...(set ? { setId: set.id, setName: set.name } : {}),
        remote: main.remote,
      };
    }
    snap.isExposedInstance = node.isExposedInstance;
    if (node.exposedInstances.length > 0) {
      snap.exposedInstances = node.exposedInstances.map(
        snapshotExposedInstance,
      );
    }
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
    const bound = node.boundVariables as Record<string, unknown>;
    const keys = Object.keys(bound).filter((key) => bound[key] !== undefined);
    if (keys.length > 0) snap.boundVariableKeys = keys;

    // Ids, not just field names (#17 counts usages per variable). Three shapes
    // live in this one record: a single alias for scalar fields, an array for
    // paint, effect and text-range fields, and a property-name-keyed object for
    // componentProperties.
    // Reading `.id` off that last shape yields nothing, so each is unwrapped
    // explicitly.
    const ids = new Set<string>();
    for (const key of keys) {
      for (const alias of variableAliases(bound[key])) ids.add(alias.id);
    }
    if (ids.size > 0) snap.boundVariableIds = [...ids];
  }

  if ("explicitVariableModes" in node) {
    const modes = node.explicitVariableModes;
    // Only recorded when non-empty: a node pinning its own mode is what makes
    // the #17 probe's per-mode answer unverifiable for it.
    if (Object.keys(modes).length > 0)
      snap.explicitVariableModes = { ...modes };
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
  return Object.entries(definitions).map(([rawName, def]) => {
    // A component property can itself be bound to a variable, and that
    // binding lives here rather than on any layer (#17).
    const ids = Object.values(def.boundVariables ?? {})
      .filter((alias): alias is VariableAlias => typeof alias?.id === "string")
      .map((alias) => alias.id);
    return {
      name: propertyDisplayName(rawName),
      type: def.type,
      ...(def.type === "INSTANCE_SWAP"
        ? { preferredValuesCount: def.preferredValues?.length ?? 0 }
        : {}),
      ...(ids.length > 0 ? { boundVariableIds: [...new Set(ids)] } : {}),
    };
  });
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

  const pinnedAncestors = collectPinnedAncestors(subject);

  return {
    id: subject.id,
    name: subject.name,
    type: subject.type,
    description: subject.description,
    propertyNames: properties.map((p) => p.name),
    properties,
    variants,
    ...(pinnedAncestors.length > 0 ? { pinnedAncestors } : {}),
  };
}
