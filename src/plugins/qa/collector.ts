/// <reference types="@figma/plugin-typings" />

/**
 * Snapshot collector: walks a resolved component set once and produces the
 * plain serializable snapshot the pure check functions run against (issue #76).
 *
 * One of exactly two places in the QA engine that touch `figma.*`. The other is
 * `theme-probe.ts`, which resolves variables per theme mode against a temporary
 * frame (#17, the ADR-0001 read-only carve-out). Everything under `checks/`
 * stays pure and fixture-tested.
 */

import { requiredFacets } from "./checklist-catalogue";
import { toHex } from "./color";
import { probeResizeBehaviour } from "./resize-probe";
import { probeThemeResolution } from "./theme-probe";
import type {
  ColorStyleSnapshot,
  ComponentPropertySnapshot,
  PinnedAncestorSnapshot,
  ComponentSetSnapshot,
  ExposedInstanceSnapshot,
  NodeSnapshot,
  PaintSnapshot,
  TextSegmentSnapshot,
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

/** Paints that are known not to be mixed. Pure - no `figma` reference. */
function mapPaints(paints: readonly Paint[]): PaintSnapshot[] {
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

function snapshotPaints(
  paints: readonly Paint[] | typeof figma.mixed,
): PaintSnapshot[] | undefined {
  if (paints === figma.mixed) return undefined;
  return mapPaints(paints);
}

function styleId(value: string | typeof figma.mixed): string {
  return value === figma.mixed ? "MIXED" : value;
}

const BOLD_WEIGHT = 700;

/**
 * Font size and boldness for #16's dual AA threshold.
 *
 * Ranges that differ are resolved to the **strictest** applicable answer: the
 * smallest size used, and bold only when every range is bold. Both defaults run
 * toward 4.5:1 rather than 3:1, so a mixed run can never be let off with the
 * lenient large-text threshold on the strength of one heading inside it.
 */
function snapshotTextMetrics(node: TextNode): {
  fontSize?: number;
  bold: boolean;
} {
  if (node.fontSize !== figma.mixed && node.fontWeight !== figma.mixed) {
    return { fontSize: node.fontSize, bold: node.fontWeight >= BOLD_WEIGHT };
  }
  const segments = node.getStyledTextSegments(["fontSize", "fontWeight"]);
  if (segments.length === 0) return { bold: false };
  return {
    fontSize: Math.min(...segments.map((s) => s.fontSize)),
    bold: segments.every((s) => s.fontWeight >= BOLD_WEIGHT),
  };
}

/** The fields #124 asks `getStyledTextSegments` for, and nothing else. */
export type StyledFillRun = Pick<
  StyledTextSegment,
  "fills" | "fillStyleId" | "fontSize" | "fontWeight"
>;

/**
 * Styled runs as the snapshot carries them (#124). The pure half of
 * `snapshotTextSegments`, split out so the mapping is fixture-tested rather
 * than trusted: it is the one piece of #124 that decides what the check will
 * see, and it is the reason a coloured link is measurable at all.
 *
 * Figma's own types settle the two facts this relies on: a run's `fills` is
 * `Paint[]`, never `figma.mixed` - a run is by definition the span over which
 * they do not change - and its `fillStyleId` is a plain `string`, never the
 * `"MIXED"` sentinel a whole layer can carry.
 */
export function textSegmentSnapshots(
  runs: readonly StyledFillRun[],
): TextSegmentSnapshot[] | undefined {
  if (runs.length === 0) return undefined;
  return runs.map((segment) => {
    const snap: TextSegmentSnapshot = {
      fontSize: segment.fontSize,
      fillStyleId: segment.fillStyleId,
      fills: mapPaints(segment.fills),
    };
    if (segment.fontWeight >= BOLD_WEIGHT) snap.bold = true;
    return snap;
  });
}

/**
 * The styled runs of a text layer whose fills are mixed (#124).
 *
 * Only for that case: a layer painted in one colour already has one answer, and
 * mixed *size* alone is still resolved to the strictest threshold above. The
 * colour is the thing a single layer-level value genuinely cannot express -
 * without the runs, a paragraph with one coloured link is not measured at all.
 *
 * Figma splits a run wherever any requested field changes, so asking for size
 * and weight alongside the fills gives each run its own real threshold rather
 * than the layer's smallest size.
 */
function snapshotTextSegments(
  node: TextNode,
): TextSegmentSnapshot[] | undefined {
  return textSegmentSnapshots(
    node.getStyledTextSegments([
      "fills",
      "fillStyleId",
      "fontSize",
      "fontWeight",
    ]),
  );
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

/**
 * Whether a node is an auto-layout frame, which is what makes size bounds
 * settable on it *and on its direct children* (#7).
 */
function isAutoLayoutFrame(node: BaseNode | null | undefined): boolean {
  return (
    node != null &&
    "layoutMode" in node &&
    node.layoutMode !== "NONE" &&
    node.layoutMode !== undefined
  );
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

  // Which component property drives this node (#3). Recorded with Figma's raw
  // suffixed keys so the check can join a binding to its definition exactly.
  // Kept on instances too: an INSTANCE_SWAP property binds via `mainComponent`
  // on the instance node itself, which is walked even though its interior is not.
  if ("componentPropertyReferences" in node) {
    const refs = node.componentPropertyReferences;
    if (refs) {
      const bound = Object.entries(refs).filter(
        (entry): entry is [string, string] => typeof entry[1] === "string",
      );
      if (bound.length > 0) {
        snap.propertyReferences = Object.fromEntries(bound);
      }
    }
  }

  // Only when it is not 1, so fixtures and payloads stay terse. #16 composites
  // this with paint opacity to measure contrast on translucent surfaces.
  if ("opacity" in node && node.opacity !== 1) {
    snap.opacity = node.opacity;
  }

  if ("fills" in node) {
    const fills = snapshotPaints(node.fills);
    if (fills) snap.fills = fills;
    // Recorded explicitly rather than left as an absent `fills`: #16 has to
    // tell "mixed per character range, measure the runs instead" apart from
    // "this node paints nothing".
    else if (node.fills === figma.mixed) snap.fillsMixed = true;
    snap.fillStyleId = styleId(node.fillStyleId);
  }
  if ("strokes" in node) {
    snap.strokes = snapshotPaints(node.strokes);
    snap.strokeStyleId = styleId(node.strokeStyleId);
  }
  if (node.type === "TEXT") {
    snap.textStyleId = styleId(node.textStyleId);
    const metrics = snapshotTextMetrics(node);
    if (metrics.fontSize !== undefined) snap.fontSize = metrics.fontSize;
    if (metrics.bold) snap.bold = true;
    if (snap.fillsMixed) {
      const segments = snapshotTextSegments(node);
      if (segments) snap.textSegments = segments;
    }
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
    // Only on a real auto-layout frame: Figma reports a value on `layoutMode:
    // "NONE"` frames too, where it means nothing, and carrying it would let the
    // stretch pre-scan reason about a distribution that does not happen.
    if (node.layoutMode !== "NONE") {
      snap.primaryAxisAlignItems = node.primaryAxisAlignItems;
    }
  }
  if ("layoutSizingHorizontal" in node) {
    snap.layoutSizingHorizontal = node.layoutSizingHorizontal;
    snap.layoutSizingVertical = node.layoutSizingVertical;
  }
  // Auto-layout size bounds (#7). Figma uses null for "unset", and #7 reports
  // exactly that absence, so an unset bound is left off the snapshot rather
  // than carried as null.
  if ("minWidth" in node) {
    if (node.minWidth !== null) snap.minWidth = node.minWidth;
    if (node.maxWidth !== null) snap.maxWidth = node.maxWidth;
    if (node.minHeight !== null) snap.minHeight = node.minHeight;
    if (node.maxHeight !== null) snap.maxHeight = node.maxHeight;
    // Read from the parent as well: bounds are settable on an auto-layout
    // frame's direct children too, so a non-auto-layout variant inside an
    // auto-layout component set is still a legitimate place for them.
    if (isAutoLayoutFrame(node) || isAutoLayoutFrame(node.parent)) {
      snap.boundsApplicable = true;
    }
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
      // The suffixed key is what layers reference (#3), so it has to survive
      // the display-name stripping rather than be reconstructed from it.
      key: rawName,
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

  const documentationLinks = subject.documentationLinks.map((link) => link.uri);

  return {
    id: subject.id,
    name: subject.name,
    type: subject.type,
    description: subject.description,
    ...(documentationLinks.length > 0 ? { documentationLinks } : {}),
    propertyNames: properties.map((p) => p.name),
    properties,
    variants,
    ...(pinnedAncestors.length > 0 ? { pinnedAncestors } : {}),
  };
}

/** Every distinct, resolvable fill style id referenced in the snapshot. */
function referencedFillStyleIds(snapshot: ComponentSetSnapshot): string[] {
  const ids = new Set<string>();
  const visit = (node: NodeSnapshot) => {
    const id = node.fillStyleId;
    // "" means unstyled and "MIXED" is not an id at all.
    if (id && id !== "MIXED") ids.add(id);
    for (const child of node.children) visit(child);
  };
  for (const variant of snapshot.variants) visit(variant.tree);
  return [...ids];
}

/**
 * Resolve the fill styles the set references into the snapshot's style table
 * (#16, issue #103). A separate async pass rather than part of `collectSnapshot`
 * so that stays synchronous, and memoized by style id so cost scales with
 * distinct styles rather than with layers.
 *
 * Why the table exists at all when Figma keeps `node.fills` in sync with the
 * style: the **name**. A contrast finding that says `"Text/Subtle" on
 * "Surface/Card"` names the one token pair a designer changes, where a pair of
 * hex values names nothing. The paints are captured too, so a style whose paint
 * is variable-bound feeds the id straight into the per-mode probe.
 *
 * Reads only - no document mutation, so no ADR-0001 carve-out is involved here.
 */
export async function collectColorStyles(
  snapshot: ComponentSetSnapshot,
): Promise<Record<string, ColorStyleSnapshot> | undefined> {
  const ids = referencedFillStyleIds(snapshot);
  if (ids.length === 0) return undefined;

  const styles: Record<string, ColorStyleSnapshot> = {};
  for (const id of ids) {
    const style = await figma.getStyleByIdAsync(id);
    // A style that cannot be loaded (deleted, or a remote library that is
    // unavailable) is simply left out: #16 then falls back to the node's own
    // fills, losing the name but not the colour.
    if (!style || style.type !== "PAINT") continue;
    const paints = snapshotPaints((style as PaintStyle).paints);
    if (paints) styles[id] = { name: style.name, paints };
  }
  return Object.keys(styles).length > 0 ? styles : undefined;
}

/**
 * Collect the snapshot a run of `requested` checks needs (an absent filter means
 * the whole catalogue): the unconditional walk, plus exactly those expensive
 * facets some requested check declared in its catalogue `needs`.
 *
 * The two facets are conditional for different reasons - the style table costs an
 * async round trip per referenced style, and the probe is the one part of a QA
 * run that touches the document (one temporary frame, removed in a `finally` -
 * see theme-probe.ts and the ADR-0001 carve-out). So a filtered run that needs
 * neither stays inert.
 *
 * The ordering below is load-bearing and lives here, next to the reason for it,
 * rather than in the operation: a paint style's own paint can be variable-bound,
 * and the probe reads the style table to decide which variables need a per-mode
 * value. Styles first, therefore, whenever both are wanted.
 *
 * Which checks need what is *not* decided here - `requiredFacets` reads it off
 * the catalogue rows, so adding a check that reads a facet is one edit in the
 * table and this function needs no change (#134).
 */
export async function prepareSnapshot(
  subject: ComponentSetNode | ComponentNode,
  requested?: readonly string[],
): Promise<ComponentSetSnapshot> {
  const snapshot = collectSnapshot(subject);
  const facets = requiredFacets(requested);

  if (facets.has("colorStyles")) {
    snapshot.colorStyles = await collectColorStyles(snapshot);
  }
  if (facets.has("theme")) {
    snapshot.theme = await probeThemeResolution(snapshot);
  }
  // Last, and after the snapshot is otherwise complete: the resize probe reads the
  // collected variant tree to decide what to drive and to give every measured box a
  // source-node identity, so it cannot run before the walk it depends on.
  if (facets.has("resizeProbe")) {
    snapshot.resizeProbe = await probeResizeBehaviour(subject, snapshot);
  }
  return snapshot;
}
