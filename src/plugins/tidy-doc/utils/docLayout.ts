/// <reference types="@figma/plugin-typings" />

// Persisted panel setting (#64, ADR-0009): which of the two Documentation
// Page layouts a build renders. Layout is a code-owned rendering branch
// chosen by the designer on the tidy-doc panel — the Doc Spec stays
// layout-free (ADR-0006). Storage lives on the plugin main thread only
// (figma.clientStorage is inaccessible from the UI iframe), mirroring
// tidy-icon-care's settings-persistence pattern.

export type DocLayout = "horizontal" | "vertical";

export const DEFAULT_DOC_LAYOUT: DocLayout = "horizontal";

const DOC_LAYOUT_STORAGE_KEY = "tidy-doc:layout";

/**
 * Guards against a stale/garbage stored (or posted) value. Anything other
 * than the literal `"vertical"` falls back to the default, so a corrupted
 * clientStorage entry or a malformed `set-layout` payload can never wedge
 * the build orchestrator into an unrecognized layout.
 */
export function normalizeDocLayout(value: unknown): DocLayout {
  return value === "vertical" ? "vertical" : DEFAULT_DOC_LAYOUT;
}

export async function getPersistedDocLayout(): Promise<DocLayout> {
  const stored = await figma.clientStorage.getAsync(DOC_LAYOUT_STORAGE_KEY);
  return normalizeDocLayout(stored);
}

export async function setPersistedDocLayout(layout: DocLayout): Promise<void> {
  await figma.clientStorage.setAsync(
    DOC_LAYOUT_STORAGE_KEY,
    normalizeDocLayout(layout),
  );
}
