/// <reference types="@figma/plugin-typings" />

import { ColorRole, ColorUsage, ScanOptions, UsageContainer } from "../types";
import { rgbToHex } from "./color";
import { isIconName, roleFor, roundOpacity } from "./categorize";

/**
 * Figma-bound tree walk. Thin adapter around the pure aggregator: it reads
 * paints / styles / bound variables off live nodes and emits a serializable
 * `ColorUsage[]`. Verified manually in Figma, not unit-tested.
 */

export interface ScanResult {
  usages: ColorUsage[];
  otherSkipped: number;
  nodesScanned: number;
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

// A node paired with whether it sits inside an icon-named subtree.
interface QueueItem {
  node: SceneNode;
  inIcon: boolean;
}

export async function collectUsages(
  roots: readonly SceneNode[],
  options: ScanOptions,
  onProgress?: (nodesScanned: number) => void,
): Promise<ScanResult> {
  const usages: ColorUsage[] = [];
  const caches: ResolveCaches = { variables: new Map(), styles: new Map() };
  let otherSkipped = 0;
  let nodesScanned = 0;

  // Seed each root with the icon state of its real ancestors. For page/all-page
  // scope roots are top-level (no ancestors), but a current-selection root can
  // be a deep node whose "icon/…" ancestor is not part of the walk.
  const queue: QueueItem[] = roots.map((node) => ({
    node,
    inIcon: ancestorIsIcon(node),
  }));

  while (queue.length > 0) {
    const { node, inIcon } = queue.shift()!;
    if (node.visible === false) continue;

    nodesScanned += 1;
    if (nodesScanned % 250 === 0) onProgress?.(nodesScanned);

    const nodeIsIcon = inIcon || isIconName(node.name);
    otherSkipped += await collectFromNode(
      node,
      nodeIsIcon,
      options,
      caches,
      usages,
    );

    if ("children" in node) {
      const isInstance = node.type === "INSTANCE";
      if (!isInstance || options.lookInsideInstances) {
        for (const child of node.children) {
          queue.push({ node: child, inIcon: nodeIsIcon });
        }
      }
    }
  }

  onProgress?.(nodesScanned);
  return { usages, otherSkipped, nodesScanned };
}

// Climb a node's real ancestors (up to the page) to see if any is icon-named.
function ancestorIsIcon(node: SceneNode): boolean {
  let cur: BaseNode | null = node.parent;
  while (cur && cur.type !== "PAGE" && cur.type !== "DOCUMENT") {
    if (isIconName(cur.name)) return true;
    cur = cur.parent;
  }
  return false;
}

async function collectFromNode(
  node: SceneNode,
  nodeIsIcon: boolean,
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
          node,
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
          node,
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
  node: SceneNode,
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
    container: resolveContainer(node),
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

/**
 * Walk ancestors to the nearest meaningful container, in priority order:
 * an enclosing COMPONENT_SET, else the nearest INSTANCE/COMPONENT (so a color
 * used inside an instance is attributed to e.g. "Button"), else the nearest
 * SECTION, else the top-level node under the page. Falls back to the node
 * itself.
 */
function resolveContainer(node: SceneNode): UsageContainer {
  let componentSet: BaseNode | null = null;
  let instanceOrComponent: BaseNode | null = null;
  let section: BaseNode | null = null;
  let cur: BaseNode = node;

  while (
    cur.parent &&
    cur.parent.type !== "PAGE" &&
    cur.parent.type !== "DOCUMENT"
  ) {
    cur = cur.parent;
    if (cur.type === "COMPONENT_SET" && !componentSet) {
      componentSet = cur;
    } else if (
      (cur.type === "INSTANCE" || cur.type === "COMPONENT") &&
      !instanceOrComponent
    ) {
      instanceOrComponent = cur;
    }
    if (cur.type === "SECTION" && !section) section = cur;
  }

  const chosen = componentSet ?? instanceOrComponent ?? section ?? cur;
  return { id: chosen.id, name: chosen.name, type: chosen.type };
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
