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
    // stop rather than spin.
    if (detachedThisPass === 0) break;
  }

  return total;
}

// Localize paint/text/effect styles on the subtree. Implemented in #18.
// Kept as a no-op here so the orchestrator's contract is stable across slices.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function localizeStyles(_root: SceneNode): Promise<number> {
  return 0;
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
