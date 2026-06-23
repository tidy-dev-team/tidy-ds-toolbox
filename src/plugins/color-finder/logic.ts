/// <reference types="@figma/plugin-typings" />

import {
  ListPagesResult,
  ScanColorsPayload,
  ScanColorsResult,
  ScanScope,
  ColorUsage,
  TidyColorFinderAction,
} from "./types";
import { collectUsages } from "./utils/scan";
import { buildColorInventory } from "./utils/inventory";
import { buildInventoryPage } from "./utils/render";

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
