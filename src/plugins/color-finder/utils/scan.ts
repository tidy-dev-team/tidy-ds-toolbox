/// <reference types="@figma/plugin-typings" />

import { CancellationGate } from "../../../shared/cancellation";

import { ColorRole, ColorUsage, ScanOptions, UsageContainer } from "../types";
import { rgbToHex } from "./color";
import { isIconName, roleFor, roundOpacity } from "./categorize";
import {
  ContainerChain,
  descendChain,
  pickContainer,
  seedChainFromAncestors,
} from "./container";

/**
 * Figma-bound tree walk. Thin adapter around the pure aggregator: it reads
 * paints / styles / bound variables off live nodes and emits a serializable
 * `ColorUsage[]`. Verified manually in Figma, not unit-tested - the one rule
 * that used to be decided in here, which container a usage belongs to, is pure
 * and fixture-tested in `container.ts`.
 */

/**
 * Items between yields, counted over everything that leaves the walk's queue -
 * hidden nodes included, since a wide band of them must not cross a batch
 * unchecked.
 *
 * The walk visits tens of thousands of nodes, so a yield per node would cost
 * far more than the walk itself, while a yield per batch stays a rounding error
 * next to the reads between them. Exported because `scanColors` builds the
 * cancellation gate from it, and the gate is what does the counting.
 */
export const SCAN_YIELD_EVERY = 500;

/**
 * Visible nodes between progress reports.
 *
 * Deliberately a different number from `SCAN_YIELD_EVERY`, and off a different
 * counter: this counts only the nodes actually scanned, so on a page with many
 * hidden nodes the two intervals drift apart and no relation between them would
 * hold anyway. A report that lands between yields simply waits for the next one
 * before the UI can paint it, which is what it did before any of this.
 */
const PROGRESS_EVERY = 250;

export interface ScanResult {
  usages: ColorUsage[];
  otherSkipped: number;
  nodesScanned: number;
  /** Whether the walk stopped early. False means it covered every node. */
  cancelled: boolean;
}

// A color style resolved once per scan: its name plus, per paint index, the id
// of any variable bound to that paint's color (for the "variable inside a
// style" case).
interface ResolvedStyle {
  name: string;
  paintVariableIds: (string | null)[];
}

// Caches for token-name resolution within a single scan.
interface ResolveCaches {
  variables: Map<string, string | null>;
  styles: Map<string, ResolvedStyle | null>;
}

// A node paired with what its ancestry already decided: whether it sits inside
// an icon-named subtree, and which container its colors are attributed to. Both
// ride down from the parent rather than being recomputed by climbing (#215).
interface QueueItem {
  node: SceneNode;
  inIcon: boolean;
  chain: ContainerChain;
}

export async function collectUsages(
  roots: readonly SceneNode[],
  options: ScanOptions,
  onProgress?: (nodesScanned: number) => void,
  gate?: CancellationGate,
): Promise<ScanResult> {
  const usages: ColorUsage[] = [];
  const caches: ResolveCaches = { variables: new Map(), styles: new Map() };
  let otherSkipped = 0;
  let nodesScanned = 0;
  let cancelled = false;

  // Seed each root from its real ancestors. For page/all-page scope roots are
  // top-level and this finds nothing, but a current-selection root can be a
  // deep node whose "icon/…" ancestor and enclosing component are not part of
  // the walk. Paid once per root; every node below inherits by descent.
  const queue: QueueItem[] = roots.map((node) => {
    const seeded = seedChainFromAncestors(node);
    return { node, inIcon: seeded.inIcon, chain: seeded.chain };
  });

  // An index rather than `shift()`, which is O(n) on an array and so made the
  // queue itself a cost on a page with many nodes. The trade is memory: the
  // consumed prefix is retained for the whole walk, where `shift()` released
  // each item as it went, so the queue holds one small record per node visited
  // rather than one per node on the frontier. Worth it against a quadratic, and
  // it is a judgement rather than a free win.
  for (let head = 0; head < queue.length; head++) {
    const { node, inIcon, chain } = queue[head];

    // Every item that leaves the queue ticks the gate, visible or not. Counting
    // it after the visibility test instead would let a wide band of hidden
    // siblings cross a whole batch with no yield and no cancellation check.
    // Read before the work, so a stopped walk never leaves a half-scanned node.
    if (gate && (await gate.step())) {
      cancelled = true;
      break;
    }

    if (node.visible === false) continue;

    nodesScanned += 1;
    if (nodesScanned % PROGRESS_EVERY === 0) onProgress?.(nodesScanned);

    const nodeIsIcon = inIcon || isIconName(node.name);
    // One per node, not one per paint: every usage on this node shares it.
    const container = pickContainer(chain, node);
    otherSkipped += await collectFromNode(
      node,
      nodeIsIcon,
      container,
      options,
      caches,
      usages,
    );

    if ("children" in node) {
      const isInstance = node.type === "INSTANCE";
      if (!isInstance || options.lookInsideInstances) {
        const childChain = descendChain(chain, node);
        for (const child of node.children) {
          queue.push({ node: child, inIcon: nodeIsIcon, chain: childChain });
        }
      }
    }
  }

  // Not on the stopped path: the caller discards a cancelled page, so a final
  // count for it would be a progress report for work that is being thrown away.
  if (!cancelled) onProgress?.(nodesScanned);
  return { usages, otherSkipped, nodesScanned, cancelled };
}

async function collectFromNode(
  node: SceneNode,
  nodeIsIcon: boolean,
  container: UsageContainer,
  options: ScanOptions,
  caches: ResolveCaches,
  out: ColorUsage[],
): Promise<number> {
  // A COMPONENT_SET's own fills/strokes are Figma's variant-group chrome (the
  // dashed wrapper border + faint fill), not design colors. Skip them; the
  // variants inside are still walked as children.
  if (node.type === "COMPONENT_SET") return 0;

  let otherSkipped = 0;

  // Fills → icon (if icon-named) / text (TEXT) / background otherwise.
  if ("fills" in node && Array.isArray(node.fills)) {
    const fillRole: ColorRole = roleFor(node.type, "fill", nodeIsIcon);
    if (roleIncluded(fillRole, options)) {
      const style = await resolveStyle(
        "fillStyleId" in node ? node.fillStyleId : "",
        caches,
      );
      const fills = node.fills as readonly Paint[];
      for (let i = 0; i < fills.length; i++) {
        otherSkipped += await pushPaint(
          container,
          fills[i],
          fillRole,
          style,
          i,
          options,
          caches,
          out,
        );
      }
    }
  }

  // Strokes → border role (icons keep stroke-as-border).
  if ("strokes" in node && Array.isArray(node.strokes)) {
    if (roleIncluded("border", options)) {
      const style = await resolveStyle(
        "strokeStyleId" in node ? node.strokeStyleId : "",
        caches,
      );
      const strokes = node.strokes as readonly Paint[];
      for (let i = 0; i < strokes.length; i++) {
        otherSkipped += await pushPaint(
          container,
          strokes[i],
          "border",
          style,
          i,
          options,
          caches,
          out,
        );
      }
    }
  }

  return otherSkipped;
}

// Returns 1 if the paint was a skipped (non-solid) "other" paint, else 0.
async function pushPaint(
  container: UsageContainer,
  paint: Paint,
  role: ColorRole,
  style: ResolvedStyle | null,
  paintIndex: number,
  options: ScanOptions,
  caches: ResolveCaches,
  out: ColorUsage[],
): Promise<number> {
  if (paint.visible === false) return 0;
  if (paint.type !== "SOLID") return 1; // gradient / image / video

  // Variable, in priority order: bound directly on the node's paint, else
  // bound on the matching paint inside the applied style (variable-in-style).
  const variableId =
    paint.boundVariables?.color?.id ??
    style?.paintVariableIds[paintIndex] ??
    undefined;
  const variableName = await resolveVariableName(variableId, caches);
  const styleName = style?.name ?? null;

  // "Tokenized" means bound to a variable; a style alone still needs tidying.
  if (options.skipTokenized && variableName !== null) return 0;

  out.push({
    hex: rgbToHex(paint.color.r, paint.color.g, paint.color.b),
    opacity: roundOpacity(paint.opacity ?? 1),
    role,
    container,
    variableName,
    styleName,
  });
  return 0;
}

function roleIncluded(role: ColorRole, options: ScanOptions): boolean {
  if (role === "background") return options.includeBackgrounds;
  if (role === "text") return options.includeText;
  if (role === "icon") return options.includeIcons;
  return options.includeBorders;
}

async function resolveVariableName(
  id: string | undefined,
  caches: ResolveCaches,
): Promise<string | null> {
  if (!id) return null;
  if (caches.variables.has(id)) return caches.variables.get(id)!;
  let name: string | null = null;
  try {
    const variable = await figma.variables.getVariableByIdAsync(id);
    name = variable ? variable.name : null;
  } catch {
    name = null;
  }
  caches.variables.set(id, name);
  return name;
}

async function resolveStyle(
  styleId: string | typeof figma.mixed,
  caches: ResolveCaches,
): Promise<ResolvedStyle | null> {
  if (typeof styleId !== "string" || styleId === "") return null;
  if (caches.styles.has(styleId)) return caches.styles.get(styleId)!;
  let resolved: ResolvedStyle | null = null;
  try {
    const style = await figma.getStyleByIdAsync(styleId);
    if (style && style.type === "PAINT") {
      const paints = (style as PaintStyle).paints;
      resolved = {
        name: style.name,
        paintVariableIds: paints.map((p) =>
          p.type === "SOLID" ? (p.boundVariables?.color?.id ?? null) : null,
        ),
      };
    }
  } catch {
    resolved = null;
  }
  caches.styles.set(styleId, resolved);
  return resolved;
}
