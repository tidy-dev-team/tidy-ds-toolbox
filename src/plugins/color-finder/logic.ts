/// <reference types="@figma/plugin-typings" />

import {
  ListPagesResult,
  ScanColorsPayload,
  ScanColorsResult,
  ScanScope,
  ColorUsage,
  TidyColorFinderAction,
  ScanImagePalettePayload,
  ScanImagePaletteResult,
  ImageExport,
  RenderPalettePagePayload,
  RenderPalettePageResult,
  SourceNodeRef,
} from "./types";
import { collectUsages } from "./utils/scan";
import { buildColorInventory } from "./utils/inventory";
import { buildInventoryPage } from "./utils/render";
import { buildPalettePage } from "./utils/render-palette";

/**
 * Tidy Color Finder handler — processes messages from the UI.
 *
 * Signature matches the parent Tidy DS Toolbox module contract
 * `(action, payload, figma?) => Promise<any>` so it can be wired into the
 * toolbox's moduleHandlers without changes.
 */
export async function tidyColorFinderHandler(
  action: string,
  payload: any,
  _figma?: PluginAPI,
): Promise<any> {
  switch (action as TidyColorFinderAction) {
    case "list-pages":
      return listPages();

    case "scan-colors":
      return await scanColors(payload as ScanColorsPayload);

    case "show-page":
      return await showPage(payload as { pageId: string });

    case "scan-image-palette":
      return await scanImagePalette(payload as ScanImagePalettePayload);

    case "render-palette-page":
      return await renderPalettePage(payload as RenderPalettePagePayload);

    default:
      console.warn(`Unknown action: ${action}`);
      return null;
  }
}

function listPages(): ListPagesResult {
  const currentId = figma.currentPage.id;
  return {
    pages: figma.root.children.map((page) => ({
      id: page.id,
      name: page.name,
      isCurrent: page.id === currentId,
    })),
  };
}

interface ResolvedScope {
  pages: PageNode[];
  label: string;
  // When set, only these top-level nodes are scanned (current-selection).
  selection?: readonly SceneNode[];
}

function resolveScope(scope: ScanScope): ResolvedScope {
  switch (scope.mode) {
    case "current-page":
      return { pages: [figma.currentPage], label: "Current page" };

    case "selected-pages": {
      const ids = new Set(scope.pageIds ?? []);
      const pages = figma.root.children.filter((p) => ids.has(p.id));
      return {
        pages,
        label: `${pages.length} page${pages.length === 1 ? "" : "s"}`,
      };
    }

    case "all-pages":
      return { pages: [...figma.root.children], label: "All pages" };

    case "current-selection":
      return {
        pages: [figma.currentPage],
        label: "Selection",
        selection: figma.currentPage.selection,
      };

    default:
      return { pages: [figma.currentPage], label: "Current page" };
  }
}

async function loadPage(page: PageNode): Promise<void> {
  const maybeLoad = (page as unknown as { loadAsync?: () => Promise<void> })
    .loadAsync;
  if (typeof maybeLoad === "function") {
    await maybeLoad.call(page);
  }
}

async function scanColors(
  payload: ScanColorsPayload,
): Promise<ScanColorsResult> {
  const { scope, options } = payload;
  const resolved = resolveScope(scope);
  const totalPages = resolved.pages.length;

  const allUsages: ColorUsage[] = [];
  let otherSkipped = 0;
  let cumulativeNodes = 0;
  let pagesScanned = 0;

  for (const page of resolved.pages) {
    await loadPage(page);

    const roots: readonly SceneNode[] = resolved.selection
      ? resolved.selection
      : page.children;

    const result = await collectUsages(roots, options, (nodesScanned) => {
      figma.ui.postMessage({
        type: "progress",
        payload: {
          pagesScanned,
          totalPages,
          nodesScanned: cumulativeNodes + nodesScanned,
        },
      });
    });

    allUsages.push(...result.usages);
    otherSkipped += result.otherSkipped;
    cumulativeNodes += result.nodesScanned;
    pagesScanned += 1;

    figma.ui.postMessage({
      type: "progress",
      payload: { pagesScanned, totalPages, nodesScanned: cumulativeNodes },
    });
  }

  const inventory = buildColorInventory(allUsages, {
    pagesScanned,
    otherSkipped,
    sortByHue: options.sortByHue ?? false,
  });

  const dateLabel = new Date().toISOString().slice(0, 10);
  const page = await buildInventoryPage(inventory, resolved.label, dateLabel);

  await goToPage(page);

  return {
    pageId: page.id,
    pageName: page.name,
    inventory,
  };
}

async function showPage(payload: { pageId: string }): Promise<void> {
  const node = await figma.getNodeByIdAsync(payload.pageId);
  if (node && node.type === "PAGE") {
    await goToPage(node);
  }
}

async function goToPage(page: PageNode): Promise<void> {
  const maybeSet = (
    figma as unknown as {
      setCurrentPageAsync?: (p: PageNode) => Promise<void>;
    }
  ).setCurrentPageAsync;
  if (typeof maybeSet === "function") {
    await maybeSet.call(figma, page);
  } else {
    figma.currentPage = page;
  }
  if (page.children.length > 0) {
    figma.viewport.scrollAndZoomIntoView([page.children[0]]);
  }
}

const DEFAULT_MAX_LONG_EDGE = 512;

function makeSourceRef(node: SceneNode): SourceNodeRef {
  return { id: node.id, name: node.name, type: node.type };
}

function hasVisibleImageFill(node: SceneNode): boolean {
  if (!node.visible) return false;
  if ("fills" in node && Array.isArray(node.fills)) {
    return (node.fills as readonly Paint[]).some(
      (f) => f.visible !== false && f.type === "IMAGE",
    );
  }
  return false;
}

async function scanImagePalette(
  payload: ScanImagePalettePayload,
): Promise<ScanImagePaletteResult> {
  const maxLongEdge = payload.maxLongEdge ?? DEFAULT_MAX_LONG_EDGE;
  const resolved = resolveScope(payload.scope);
  const totalPages = resolved.pages.length;

  const images: ImageExport[] = [];
  let skipped = 0;
  let pagesScanned = 0;
  let totalImagesDetected = 0;

  for (const page of resolved.pages) {
    await loadPage(page);

    const roots: readonly SceneNode[] = resolved.selection
      ? resolved.selection
      : page.children;

    const imageNodes: SceneNode[] = [];
    for (const root of roots) {
      walkImageNodes(root, imageNodes);
    }
    totalImagesDetected += imageNodes.length;

    for (let i = 0; i < imageNodes.length; i++) {
      const node = imageNodes[i];
      try {
        let scale = 1;
        if (
          "width" in node &&
          "height" in node &&
          typeof node.width === "number" &&
          typeof node.height === "number"
        ) {
          const longest = Math.max(node.width, node.height);
          if (longest > 0 && longest > maxLongEdge) {
            scale = maxLongEdge / longest;
          }
        }

        const exportSettings: ExportSettingsImage = {
          format: "PNG",
          constraint: { type: "SCALE", value: scale },
        };

        const bytes = await (
          node as SceneNode & {
            exportAsync: (s: ExportSettingsImage) => Promise<Uint8Array>;
          }
        ).exportAsync(exportSettings);

        images.push({
          imageId: `${node.id}_${i}_${Date.now()}`,
          source: makeSourceRef(node),
          pngBytes: bytes,
        });
      } catch {
        skipped++;
      }

      figma.ui.postMessage({
        type: "progress",
        payload: {
          phase: "exporting",
          pagesScanned,
          totalPages,
          imagesExported: images.length,
          totalImages: totalImagesDetected,
        },
      });
    }

    pagesScanned++;
  }

  return {
    images,
    skipped,
    scopeLabel: resolved.label,
    pagesScanned,
    totalPages,
  };
}

function walkImageNodes(node: SceneNode, out: SceneNode[]): void {
  if (hasVisibleImageFill(node)) {
    out.push(node);
  }
  if ("children" in node) {
    for (const child of (node as ChildrenMixin).children) {
      walkImageNodes(child, out);
    }
  }
}

async function renderPalettePage(
  payload: RenderPalettePagePayload,
): Promise<RenderPalettePageResult> {
  const { palette, summary, scopeLabel } = payload;
  const page = await buildPalettePage(palette, summary, scopeLabel);
  await goToPage(page);

  return {
    pageId: page.id,
    pageName: page.name,
  };
}
