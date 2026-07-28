/**
 * The approved-asset manifest #8 checks against (issue #122).
 *
 * **Why a manifest exists at all.** The plugin API cannot answer "did this icon
 * come from Foundations?": `libraryName` exists only for variable collections,
 * and an instance exposes its main component's `key` and `remote` flag - never a
 * file key or a library name. A publish key *is* globally unique and stable
 * across files, so a list of the keys Foundations publishes turns the
 * unanswerable question into a lookup. Without it #8 could only ever warn.
 *
 * **Generated, never hand-edited.** `scripts/generate-asset-manifest.mjs` calls
 * the Figma REST API out-of-band (the plugin sandbox has no network) and writes
 * `asset-manifest.json`, which esbuild inlines into the bundle. Committed on
 * purpose: the approved set is then reviewable in a diff and reproducible from a
 * released build, rather than living per-machine in `clientStorage` where two
 * designers could silently disagree about what "approved" means.
 *
 * **Policy lives here, facts live in the JSON.** The generator records only what
 * the REST API says - key, name, the page the component sits on. Whether a page
 * counts as deprecated is a judgement that belongs in reviewable, testable code,
 * so `isDeprecatedPage` is the only place that decides it. Regenerating the
 * manifest therefore cannot quietly change the verdict rules.
 *
 * **An absent manifest is a supported state, not an error.** Until someone runs
 * the generator, `generatedAt` is null and #8 behaves exactly as it did before
 * this ticket: remote instances pass carrying the unverifiable-origin caveat. A
 * check that hard-failed on a missing manifest would make every fresh clone
 * report defects that are not there.
 */

import raw from "./asset-manifest.json";

export interface AssetManifestEntry {
  /** The component's own name, e.g. `Size=24` for a variant. */
  name: string;
  /** The Figma page the component sits on - the "directory" #8 reasons about. */
  page: string;
  /** Owning component set name, when the component is a variant. */
  set?: string;
}

export interface AssetManifest {
  /**
   * ISO date the manifest was generated, or null when it never has been.
   *
   * Reported on every row that depends on it: an asset published after this date
   * is legitimately absent, and a designer can only tell that apart from a real
   * defect if the row says when the list was taken.
   */
  generatedAt: string | null;
  /** Which Figma file the keys came from. Null in an ungenerated manifest. */
  source: { fileKey: string; fileName: string } | null;
  /** Publish key -> what Foundations publishes under it. */
  components: Record<string, AssetManifestEntry>;
}

/**
 * Page names that mean "do not use this any more".
 *
 * Matched as whole words so a page called `Iconography` is not caught by
 * `icon`-adjacent substrings, and deliberately narrow: a false positive here
 * turns a legitimate asset into a hard `fail`, which is the one outcome this
 * check must never invent. Anything not matched is treated as current.
 */
const DEPRECATED_PAGE = /\b(deprecated|legacy|archives?|archived|obsolete)\b/i;

/**
 * Whether a page name marks a deprecated asset directory.
 *
 * Kept separate from the manifest data so the rule is unit-testable and a
 * regenerated manifest cannot change what "deprecated" means - only which
 * components sit where.
 */
export function isDeprecatedPage(page: string): boolean {
  return DEPRECATED_PAGE.test(page);
}

/**
 * Coerce the bundled JSON into the manifest shape.
 *
 * Defensive because the file is generated: a truncated or half-written manifest
 * must degrade to "not generated" rather than throw inside a check and take the
 * whole QA run down with it. Entries missing a key or a page are dropped
 * individually, for the same reason.
 */
export function normalizeManifest(input: unknown): AssetManifest {
  const empty: AssetManifest = {
    generatedAt: null,
    source: null,
    components: {},
  };
  if (typeof input !== "object" || input === null) return empty;

  const record = input as Record<string, unknown>;
  const generatedAt =
    typeof record.generatedAt === "string" ? record.generatedAt : null;

  const sourceRaw = record.source;
  const source =
    typeof sourceRaw === "object" &&
    sourceRaw !== null &&
    typeof (sourceRaw as Record<string, unknown>).fileKey === "string" &&
    typeof (sourceRaw as Record<string, unknown>).fileName === "string"
      ? {
          fileKey: (sourceRaw as Record<string, unknown>).fileKey as string,
          fileName: (sourceRaw as Record<string, unknown>).fileName as string,
        }
      : null;

  const components: Record<string, AssetManifestEntry> = {};
  const componentsRaw = record.components;
  if (typeof componentsRaw === "object" && componentsRaw !== null) {
    for (const [key, value] of Object.entries(
      componentsRaw as Record<string, unknown>,
    )) {
      if (typeof value !== "object" || value === null) continue;
      const entry = value as Record<string, unknown>;
      if (typeof entry.name !== "string" || typeof entry.page !== "string") {
        continue;
      }
      components[key] = {
        name: entry.name,
        page: entry.page,
        ...(typeof entry.set === "string" ? { set: entry.set } : {}),
      };
    }
  }

  // A manifest with a date but no components is a generation that produced
  // nothing - treat it as ungenerated rather than as "Foundations publishes
  // nothing", which would flag every asset in the file as unapproved.
  if (Object.keys(components).length === 0) return empty;

  return { generatedAt, source, components };
}

/** True when the manifest has usable contents. */
export function isManifestGenerated(manifest: AssetManifest): boolean {
  return Object.keys(manifest.components).length > 0;
}

/** The manifest the checks use, unless a test injects its own. */
export const ASSET_MANIFEST: AssetManifest = normalizeManifest(raw);
