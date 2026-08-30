/// <reference types="@figma/plugin-typings" />

/**
 * The Figma-touching half of Off-Boarding's decide-first split (#155).
 *
 * It reads the file into the plain `FileInventory` the planners consume, and it
 * writes and reads the marker that says a temporary page is ours. Nothing here
 * decides anything: every judgement lives in `plan.ts`, where it is testable
 * without a document.
 */

import {
  FileInventory,
  PackManifest,
  PageSummary,
  TempPageSummary,
  TEMP_PAGE_MANIFEST_KEY,
  TEMP_PAGE_MARKER_KEY,
  TEMP_PAGE_NAME,
} from "./plan";

/** The frame plugin-data key pack has always written the source name to. */
export const PACKED_FRAME_PAGE_NAME_KEY = "tcc:pageName";

/**
 * The value of the marker. Any non-empty value means ours; the value itself is
 * recorded only so a dump is readable.
 */
const MARKER_VALUE = "off-boarding";

function carriesTempName(page: PageNode): boolean {
  return page.name.trim() === TEMP_PAGE_NAME;
}

/** Whether this page was created by Off-Boarding, by marker and never by name. */
export function isOurTempPage(page: PageNode): boolean {
  return page.getPluginData(TEMP_PAGE_MARKER_KEY) === MARKER_VALUE;
}

/** Stamps a page as ours. Called only on a page this module just created. */
export function markAsOurTempPage(page: PageNode): void {
  page.setPluginData(TEMP_PAGE_MARKER_KEY, MARKER_VALUE);
}

export function writeManifest(page: PageNode, manifest: PackManifest): void {
  page.setPluginData(TEMP_PAGE_MANIFEST_KEY, JSON.stringify(manifest));
}

/**
 * Forgets what the last pack recorded.
 *
 * Called when the temporary page is emptied, and it has to be, because clearing
 * the page removes its children and not its plugin data. A manifest left behind
 * describes frames that no longer exist, and `planUnpack` accepts a manifest
 * whose length matches the frames it can see - so a later pack that happens to
 * produce the same number of frames would restore them under the *previous*
 * pack's page names, silently and with nothing to signal it.
 */
export function clearManifest(page: PageNode): void {
  page.setPluginData(TEMP_PAGE_MANIFEST_KEY, "");
}

/**
 * The manifest a pack wrote, or null.
 *
 * Unreadable data is null rather than an error: a manifest that will not parse
 * is no worse than one that was never written, and the planner already handles
 * a missing one by falling back to the frames themselves.
 */
export function readManifest(page: PageNode): PackManifest | null {
  const raw = page.getPluginData(TEMP_PAGE_MANIFEST_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as PackManifest;
    if (!parsed || !Array.isArray(parsed.pages)) return null;
    return parsed;
  } catch {
    return null;
  }
}

function summariseTempPage(page: PageNode): TempPageSummary {
  const frames = page.children
    .filter((node): node is FrameNode => node.type === "FRAME")
    .map((frame) => ({
      restoresToPageName:
        frame.getPluginData(PACKED_FRAME_PAGE_NAME_KEY) || frame.name,
    }));

  return {
    id: page.id,
    name: page.name,
    marked: isOurTempPage(page),
    frames,
    manifest: readManifest(page),
  };
}

/**
 * Reads the file into a plain description.
 *
 * A page carrying the temporary name is listed as a candidate whether or not it
 * is ours, because "someone else's page is sitting on our name" is a fact the
 * planners have to be able to see in order to refuse.
 */
export function collectInventory(): FileInventory {
  const pages: PageSummary[] = [];
  const tempCandidates: TempPageSummary[] = [];

  for (const page of figma.root.children) {
    if (carriesTempName(page) || isOurTempPage(page)) {
      tempCandidates.push(summariseTempPage(page));
      continue;
    }
    pages.push({
      id: page.id,
      name: page.name,
      topLevelNodeCount: page.children.length,
    });
  }

  return { pages, tempCandidates };
}
