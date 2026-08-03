import type { FileContext, FoundationPagesPayload } from "../types";
import {
  FILE_KEY_KEY,
  LAST_FOUNDATION_PAGE_ID_KEY,
  PLUGIN_NAMESPACE,
} from "./constants";
import { findFoundationPages } from "./foundationPages";
import { parseFileKey } from "./csv";

export function getLastFoundationPageId(figma: PluginAPI): string | null {
  return (
    figma.root.getSharedPluginData(
      PLUGIN_NAMESPACE,
      LAST_FOUNDATION_PAGE_ID_KEY,
    ) || null
  );
}

export function setLastFoundationPageId(
  figma: PluginAPI,
  id: string | null,
): void {
  figma.root.setSharedPluginData(
    PLUGIN_NAMESPACE,
    LAST_FOUNDATION_PAGE_ID_KEY,
    id ?? "",
  );
}

/**
 * The Foundation pages of this file (ADR-0011). Reads page names only, so it
 * stays cheap on a large file.
 */
export function getFoundationPagesPayload(
  figma: PluginAPI,
): FoundationPagesPayload {
  const lookup = findFoundationPages(
    figma.root.children
      .filter((child) => child.type === "PAGE")
      .map((page) => ({ id: page.id, name: page.name })),
  );

  if (lookup.ignoredDividerLabels.length > 0) {
    console.warn(
      `More than one Foundation divider found; using the first and ignoring: ${lookup.ignoredDividerLabels.join(", ")}`,
    );
  }

  let lastSelectedPageId = getLastFoundationPageId(figma);
  if (
    lastSelectedPageId &&
    !lookup.pages.some((page) => page.id === lastSelectedPageId)
  ) {
    lastSelectedPageId = null;
    setLastFoundationPageId(figma, null);
  }

  return { pages: lookup.pages, lastSelectedPageId, source: lookup.source };
}

/**
 * The file key used to build CSV links. Figma withholds `figma.fileKey` on
 * some installs, so a key the designer pasted once is the fallback.
 */
export function getFileContext(figma: PluginAPI): FileContext {
  const fromFigma = figma.fileKey ?? null;
  if (fromFigma) return { fileKey: fromFigma, fromFigma: true };

  const stored =
    figma.root.getSharedPluginData(PLUGIN_NAMESPACE, FILE_KEY_KEY) || null;
  return { fileKey: stored, fromFigma: false };
}

/** Store a key parsed out of a pasted URL. Returns null if nothing parsed. */
export function setFileKeyFromInput(
  figma: PluginAPI,
  input: string,
): string | null {
  const key = parseFileKey(input);
  if (!key) return null;

  figma.root.setSharedPluginData(PLUGIN_NAMESPACE, FILE_KEY_KEY, key);
  return key;
}
