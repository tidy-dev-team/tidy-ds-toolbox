// Generate the approved-asset manifest #8 checks against (issue #122).
//
// Why this runs out-of-band: the plugin sandbox has no network, and no plugin
// API enumerates the components a library publishes. The REST API does, so the
// key list is produced here and committed, then inlined into the bundle by
// esbuild. See src/plugins/qa/asset-manifest.ts for how the check consumes it
// and why policy (what counts as a deprecated page) deliberately stays in code.
//
// The output is FACTS ONLY - key, name, page, owning set - so regenerating can
// never quietly change a verdict rule, only which components sit where.
//
// Usage:
//   FIGMA_TOKEN=figd_... npm run manifest:assets -- <fileKey> [<fileKey>...]
//
// The token needs `file_content:read` on the Foundations file (a personal access
// token from Figma → Settings → Security works). Several file keys are accepted
// so a design system split across files still produces one manifest.
//
// Refresh story: rerun this whenever Foundations publishes new assets, commit
// the diff, and release. Until then a newly published asset reports as
// unapproved with a `warn` naming the manifest date - never a false `fail`.

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(repoRoot, "src/plugins/qa/asset-manifest.json");
const API = "https://api.figma.com/v1";

const log = (m) => process.stdout.write(`[asset-manifest] ${m}\n`);
const fail = (m) => {
  process.stderr.write(`[asset-manifest] ${m}\n`);
  process.exit(1);
};

const token = process.env.FIGMA_TOKEN;
if (!token) {
  fail(
    "FIGMA_TOKEN is not set. Create a personal access token in Figma → Settings → Security, then rerun:\n" +
      "  FIGMA_TOKEN=figd_... npm run manifest:assets -- <fileKey>",
  );
}

const fileKeys = process.argv.slice(2).filter((a) => !a.startsWith("-"));
if (fileKeys.length === 0) {
  fail(
    "No file key given. Pass the Foundations file key(s):\n" +
      "  npm run manifest:assets -- CdytzPWDTc7npImeQG0Pnc\n" +
      "The key is the segment after /design/ in the file URL.",
  );
}

async function api(path) {
  const response = await fetch(`${API}${path}`, {
    headers: { "X-Figma-Token": token },
  });
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    // 403 on a file the token can read usually means the token lacks the
    // file_content scope rather than that the file is private, and that is worth
    // saying out loud - it is the most common way this script fails.
    const hint =
      response.status === 403
        ? " (check the token has file_content:read and access to this file)"
        : "";
    fail(
      `GET ${path} failed: ${response.status} ${response.statusText}${hint}\n${body.slice(0, 400)}`,
    );
  }
  return response.json();
}

/**
 * Every published component in one file, keyed by publish key.
 *
 * `/components` lists variants individually, which is exactly what the check
 * needs: an instance points at a variant, so the variant's key is what it can
 * be looked up by. `containing_frame.pageName` is the "directory" the
 * deprecated-page rule reads; `containingStateGroup.name` is the owning set,
 * kept so a finding can name something a designer recognises.
 */
async function componentsOf(fileKey) {
  const { meta } = await api(`/files/${fileKey}/components`);
  const components = meta?.components ?? [];
  const entries = {};
  let skipped = 0;
  for (const component of components) {
    const page = component.containing_frame?.pageName;
    if (!component.key || !page) {
      // Without a page there is nothing to judge the directory rule against, so
      // the entry would be half-useless; count it rather than dropping silently.
      skipped += 1;
      continue;
    }
    const set = component.containing_frame?.containingStateGroup?.name;
    entries[component.key] = {
      name: component.name,
      page,
      ...(set ? { set } : {}),
    };
  }
  if (skipped > 0) {
    log(`${fileKey}: skipped ${skipped} component(s) with no page name`);
  }
  return entries;
}

const components = {};
const sources = [];
for (const fileKey of fileKeys) {
  const file = await api(`/files/${fileKey}?depth=1`);
  const entries = await componentsOf(fileKey);
  const count = Object.keys(entries).length;
  if (count === 0) {
    fail(
      `${fileKey} ("${file.name}") publishes no components. Refusing to write an empty manifest, ` +
        "which would report every asset in the file as unapproved.",
    );
  }
  log(`${fileKey} ("${file.name}"): ${count} published components`);
  sources.push({ fileKey, fileName: file.name });
  for (const [key, entry] of Object.entries(entries)) components[key] = entry;
}

// Sorted so a regeneration produces a reviewable diff rather than a reshuffle:
// the point of committing this file is that someone can see what changed.
const sorted = {};
for (const key of Object.keys(components).sort()) sorted[key] = components[key];

// One `source` for the single-file case (what the check quotes on the row), the
// full list when several files were merged.
const manifest = {
  generatedAt: new Date().toISOString().slice(0, 10),
  source: sources[0],
  ...(sources.length > 1 ? { sources } : {}),
  components: sorted,
};

const previous = (() => {
  try {
    return JSON.parse(readFileSync(OUT, "utf8"));
  } catch {
    return { components: {} };
  }
})();
const before = Object.keys(previous.components ?? {}).length;
const after = Object.keys(sorted).length;

writeFileSync(OUT, `${JSON.stringify(manifest, null, 2)}\n`);
log(`wrote ${OUT.replace(`${repoRoot}/`, "")}: ${before} → ${after} keys`);
if (after < before) {
  log(
    `NOTE: ${before - after} key(s) disappeared. Assets unpublished from the library will now ` +
      "report as unapproved - confirm that is intended before committing.",
  );
}
log("commit the diff, then rebuild so the bundle picks it up");
