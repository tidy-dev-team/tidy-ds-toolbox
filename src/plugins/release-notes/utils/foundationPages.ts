/**
 * Which pages are Foundation pages (ADR-0011).
 *
 * Figma hands a plugin a flat, ordered list of pages and nothing else: the
 * groups a designer sees in the sidebar are produced entirely by *divider
 * pages*, whose names are made of dashes with a label in the middle. So the
 * Foundation area is reconstructed from that same convention - the run of
 * pages after the divider labelled "Foundation", up to the next divider.
 *
 * Pure on purpose: it takes `{ id, name }[]` and returns a slice, so every
 * shape a file can be in is fixture-tested without a canvas.
 */

import type { FoundationPageSource } from "../types";

export interface PageRef {
  id: string;
  name: string;
}

export interface FoundationLookup {
  pages: PageRef[];
  source: FoundationPageSource;
  /** Dividers that also said "Foundation" and were ignored. */
  ignoredDividerLabels: string[];
}

/** Dash-like characters designers build dividers out of. */
const DASH_RUN = /[-‐-―─-╿＿－_=]{3,}/;
const DASH_CHARS = /[-‐-―─-╿＿－_=]+/g;

/**
 * A page acts as a divider when its name carries a run of three or more
 * dash-like characters. That is what makes Figma render it as a separator, and
 * what makes a human read the pages under it as a group.
 */
export function isDividerName(name: string): boolean {
  return DASH_RUN.test(name);
}

/** The readable part of a divider name: "———— 🛠 Foundation ————" -> "🛠 Foundation". */
export function dividerLabel(name: string): string {
  return name.replace(DASH_CHARS, " ").trim();
}

function isFoundationDivider(name: string): boolean {
  return isDividerName(name) && /foundation/i.test(dividerLabel(name));
}

/**
 * The Foundation area of a file.
 *
 * With no Foundation divider there is no Foundation area, and every
 * non-divider page is offered instead - reported as `source: "all-pages"` so
 * the panel can say so rather than pretending the list is authoritative.
 */
export function findFoundationPages(pages: PageRef[]): FoundationLookup {
  const foundationDividerIndices = pages
    .map((page, index) => (isFoundationDivider(page.name) ? index : -1))
    .filter((index) => index !== -1);

  if (foundationDividerIndices.length === 0) {
    return {
      pages: pages.filter((page) => !isDividerName(page.name)),
      source: "all-pages",
      ignoredDividerLabels: [],
    };
  }

  // Two Foundation areas in one file is a file problem, not a case to model:
  // the first wins and the rest are reported so the caller can log them.
  const [startIndex, ...ignoredIndices] = foundationDividerIndices;

  const area: PageRef[] = [];
  for (let index = startIndex + 1; index < pages.length; index += 1) {
    if (isDividerName(pages[index].name)) break;
    area.push(pages[index]);
  }

  return {
    pages: area,
    source: "foundation-divider",
    ignoredDividerLabels: ignoredIndices.map((index) =>
      dividerLabel(pages[index].name),
    ),
  };
}
