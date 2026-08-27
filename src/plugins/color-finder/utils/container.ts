import { UsageContainer } from "../types";
import { isIconName } from "./categorize";

/**
 * Deciding which container a color usage is attributed to, without walking
 * upward once per usage.
 *
 * The scan walks the tree downward, and a parent's ancestry decides its
 * children's: the nearest enclosing component set, instance/component and
 * section are all knowable from the parent plus what the parent itself is. So
 * the chain rides down the queue the same way the scan's `inIcon` flag already
 * does, and the upward walk is paid once per *root* rather than once per paint.
 *
 * That matters because each hop of the upward walk read `parent`, `type` and
 * `name` off a live node, so the old cost was nodes x depth x paints of sandbox
 * round trips for information the descent already had.
 *
 * Pure by design - it names only the four node fields it reads, so the whole
 * rule is fixture-tested without a document.
 */

/** The little of a node this module reads. `SceneNode` satisfies it. */
export interface ContainerNode {
  readonly id: string;
  readonly name: string;
  readonly type: string;
  readonly parent: ContainerNode | null;
}

/**
 * The nearest ancestor of each kind the attribution rule cares about, plus the
 * outermost one. All four are candidates; `pickContainer` ranks them.
 */
export interface ContainerChain {
  /** Nearest enclosing COMPONENT_SET. */
  readonly componentSet: UsageContainer | null;
  /** Nearest enclosing INSTANCE or COMPONENT. */
  readonly instanceOrComponent: UsageContainer | null;
  /** Nearest enclosing SECTION. */
  readonly section: UsageContainer | null;
  /** Outermost ancestor, the one sitting directly under the page. */
  readonly topLevel: UsageContainer | null;
}

const EMPTY: ContainerChain = {
  componentSet: null,
  instanceOrComponent: null,
  section: null,
  topLevel: null,
};

/** The chain of a node with no ancestors below the page. */
export function emptyChain(): ContainerChain {
  return EMPTY;
}

function containerOf(node: ContainerNode): UsageContainer {
  return { id: node.id, name: node.name, type: node.type };
}

/**
 * The chain for the children of `parent`, given `parent`'s own chain.
 *
 * Nearest wins for the three kinds, so `parent` is offered first; outermost
 * wins for `topLevel`, so an already-known one is kept.
 */
export function descendChain(
  chain: ContainerChain,
  parent: ContainerNode,
): ContainerChain {
  const self = containerOf(parent);
  return {
    componentSet: parent.type === "COMPONENT_SET" ? self : chain.componentSet,
    instanceOrComponent:
      parent.type === "INSTANCE" || parent.type === "COMPONENT"
        ? self
        : chain.instanceOrComponent,
    section: parent.type === "SECTION" ? self : chain.section,
    topLevel: chain.topLevel ?? self,
  };
}

/**
 * The container a usage on `node` is attributed to, in priority order: the
 * enclosing component set, else the nearest instance/component (so a color
 * inside an instance is attributed to e.g. "Button"), else the nearest section,
 * else the top-level node under the page, else the node itself.
 */
export function pickContainer(
  chain: ContainerChain,
  node: ContainerNode,
): UsageContainer {
  return (
    chain.componentSet ??
    chain.instanceOrComponent ??
    chain.section ??
    chain.topLevel ??
    containerOf(node)
  );
}

/**
 * Builds a node's chain by climbing its real ancestors, and reports whether any
 * of them is icon-named.
 *
 * Used to seed a scan's roots only. A page or all-pages scan roots at the page's
 * children, where this returns the empty chain; a current-selection scan can
 * root at a deep node whose ancestors are not part of the walk, and this is
 * what stops such a root losing its attribution and its icon state.
 *
 * One climb answers both questions, because both were separate climbs before
 * and neither needs a second pass.
 */
export function seedChainFromAncestors(node: ContainerNode): {
  chain: ContainerChain;
  inIcon: boolean;
} {
  const ancestors: ContainerNode[] = [];
  let cur: ContainerNode | null = node.parent;
  while (cur && cur.type !== "PAGE" && cur.type !== "DOCUMENT") {
    ancestors.push(cur);
    cur = cur.parent;
  }

  // Outermost first, so `descendChain`'s nearest-wins reads the same way here
  // as it does during the scan's own descent.
  let chain = emptyChain();
  for (let i = ancestors.length - 1; i >= 0; i--) {
    chain = descendChain(chain, ancestors[i]);
  }

  return {
    chain,
    inIcon: ancestors.some((ancestor) => isIconName(ancestor.name)),
  };
}
