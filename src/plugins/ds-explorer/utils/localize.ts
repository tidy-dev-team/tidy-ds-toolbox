/// <reference types="@figma/plugin-typings" />

// Shared localization helper for components created from the DS (Kido-DS).
//
// When the toolbox clones a library-imported component set, `.clone()` only makes
// the TOP-LEVEL set local. Underneath, nested instances still point at Kido-DS
// components and styles still bind to remote Kido-DS styles, silently re-linking
// the working file to Kido-DS. This module de-links a clone after the fact.
//
// Decisions (see issues #14, #15, #16):
//  - Nested instances are recursively DETACHED into frames. detachInstance()
//    preserves the layer tree and visuals; only swap/variant capability is lost,
//    which is fine because nested instances are fixed once placed.
//  - Styles (paint/text/effect) are LOCALIZED (#18).
//  - Variables/tokens are intentionally LEFT bound to Kido-DS — never touched here.

export type LocalizeLevel = "none" | "detach" | "styles" | "full";

export const LOCALIZE_LEVELS: readonly LocalizeLevel[] = [
  "none",
  "detach",
  "styles",
  "full",
];

// A node that can contain descendants we can search/detach.
type ContainerNode = SceneNode & ChildrenMixin;

function isContainer(node: SceneNode): node is ContainerNode {
  return "findAll" in node;
}

// Recursively detach every INSTANCE descendant of `root` into a frame.
//
// Detaching a parent instance leaves its (formerly nested) children as real
// instances inside the new frame, so we loop and re-query until none remain.
// Variants of a COMPONENT_SET are COMPONENT nodes and are never detached — only
// INSTANCE descendants are. Returns the number of instances detached.
export function detachNestedInstances(root: SceneNode): number {
  if (!isContainer(root)) return 0;

  let total = 0;
  // Guard against a pathological non-converging loop.
  for (let pass = 0; pass < 10000; pass++) {
    const instances = root.findAll(
      (n) => n.type === "INSTANCE",
    ) as InstanceNode[];
    if (instances.length === 0) break;

    let detachedThisPass = 0;
    for (const instance of instances) {
      try {
        instance.detachInstance();
        total++;
        detachedThisPass++;
      } catch (error) {
        // A reference may be stale because we detached its parent earlier in
        // this pass; the next pass re-queries and catches it fresh.
        console.warn("Unable to detach nested instance:", error);
      }
    }

    // No progress this pass means the remaining instances can't be detached;
    // stop rather than spin, but surface it — a clean count would otherwise
    // hide that the subtree is still partly linked to Kido-DS.
    if (detachedThisPass === 0) {
      console.warn(
        `detachNestedInstances: gave up with ${instances.length} instance(s) still present on '${root.name}'`,
      );
      break;
    }
  }

  return total;
}

// Resolve a node's remote style id to a LOCAL style of the same kind, creating
// (and caching) the local copy on first encounter. Returns the local style id to
// assign, or null when the style is empty, not found, or already local.
//
// Paints/effects are copied verbatim — a Paint that carries a color-variable
// binding rides along unchanged, which preserves the variable link (variables
// are intentionally kept bound to Kido-DS).
async function resolveLocalStyleId(
  rawId: string,
  cache: Map<string, string>,
): Promise<string | null> {
  if (!rawId) return null;
  const cached = cache.get(rawId);
  if (cached) return cached;

  const style = await figma.getStyleByIdAsync(rawId);
  if (!style || !style.remote) return null;

  let local: BaseStyle | null = null;
  if (style.type === "PAINT") {
    const paintStyle = figma.createPaintStyle();
    paintStyle.name = style.name;
    paintStyle.paints = (style as PaintStyle).paints;
    local = paintStyle;
  } else if (style.type === "EFFECT") {
    const effectStyle = figma.createEffectStyle();
    effectStyle.name = style.name;
    effectStyle.effects = (style as EffectStyle).effects;
    local = effectStyle;
  } else if (style.type === "TEXT") {
    const remote = style as TextStyle;
    await figma.loadFontAsync(remote.fontName);
    const textStyle = figma.createTextStyle();
    textStyle.name = remote.name;
    textStyle.fontName = remote.fontName;
    textStyle.fontSize = remote.fontSize;
    textStyle.letterSpacing = remote.letterSpacing;
    textStyle.lineHeight = remote.lineHeight;
    textStyle.textDecoration = remote.textDecoration;
    textStyle.textCase = remote.textCase;
    textStyle.paragraphIndent = remote.paragraphIndent;
    textStyle.paragraphSpacing = remote.paragraphSpacing;
    textStyle.listSpacing = remote.listSpacing;
    textStyle.hangingPunctuation = remote.hangingPunctuation;
    textStyle.hangingList = remote.hangingList;
    textStyle.leadingTrim = remote.leadingTrim;
    local = textStyle;
  }

  if (!local) return null;
  cache.set(rawId, local.id);
  return local.id;
}

// Ensure every font used by a text node is loaded before we mutate its style.
async function loadTextNodeFonts(node: TextNode): Promise<void> {
  if (node.fontName !== figma.mixed) {
    await figma.loadFontAsync(node.fontName as FontName);
    return;
  }
  const segments = node.getStyledTextSegments(["fontName"]);
  await Promise.all(
    segments.map((segment) => figma.loadFontAsync(segment.fontName)),
  );
}

// Localize paint/text/effect styles on the subtree. For each REMOTE style
// referenced by fillStyleId / strokeStyleId / effectStyleId / textStyleId, a
// deduplicated local copy is created and reassigned via the async setters.
// boundVariables are never touched — variables stay linked to Kido-DS.
// Text nodes whose textStyleId is mixed are skipped (known v1 gap).
// Returns the number of style references reassigned to local copies.
export async function localizeStyles(root: SceneNode): Promise<number> {
  const nodes: SceneNode[] = isContainer(root)
    ? [root, ...root.findAll(() => true)]
    : [root];

  const cache = new Map<string, string>();
  let reassigned = 0;

  for (const node of nodes) {
    try {
      // Paint styles — fill and stroke.
      const paintFields: ["fillStyleId" | "strokeStyleId", "fill" | "stroke"][] =
        [
          ["fillStyleId", "fill"],
          ["strokeStyleId", "stroke"],
        ];
      for (const [prop, kind] of paintFields) {
        if (!(prop in node)) continue;
        const raw = (node as unknown as Record<string, unknown>)[prop];
        if (typeof raw !== "string" || !raw) continue; // skip mixed/empty
        const localId = await resolveLocalStyleId(raw, cache);
        if (!localId) continue;
        if (kind === "fill") {
          await (node as GeometryMixin).setFillStyleIdAsync(localId);
        } else {
          await (node as GeometryMixin).setStrokeStyleIdAsync(localId);
        }
        reassigned++;
      }

      // Effect styles.
      if ("effectStyleId" in node) {
        const raw = (node as unknown as Record<string, unknown>).effectStyleId;
        if (typeof raw === "string" && raw) {
          const localId = await resolveLocalStyleId(raw, cache);
          if (localId) {
            await (node as BlendMixin).setEffectStyleIdAsync(localId);
            reassigned++;
          }
        }
      }

      // Text styles.
      if (node.type === "TEXT") {
        const raw = node.textStyleId;
        if (typeof raw === "string" && raw) {
          const localId = await resolveLocalStyleId(raw, cache);
          if (localId) {
            await loadTextNodeFonts(node);
            await node.setTextStyleIdAsync(localId);
            reassigned++;
          }
        }
      }
    } catch (error) {
      console.warn("Unable to localize style on node:", node.id, error);
    }
  }

  return reassigned;
}

// Orchestrate de-linking of a freshly cloned component (set) per the chosen level.
//  - "none"    → no-op (preserves the old fully-linked behavior)
//  - "detach"  → detach nested instances only
//  - "styles"  → localize styles only (#18)
//  - "full"    → detach THEN localize styles (ordering is load-bearing: style
//                bindings inside a still-linked instance can only be localized
//                once the instance is detached)
export async function localizeClone(
  node: SceneNode,
  level: LocalizeLevel,
): Promise<{ detached: number; styles: number }> {
  let detached = 0;
  let styles = 0;

  if (level === "detach" || level === "full") {
    detached = detachNestedInstances(node);
  }
  if (level === "styles" || level === "full") {
    styles = await localizeStyles(node);
  }

  return { detached, styles };
}
