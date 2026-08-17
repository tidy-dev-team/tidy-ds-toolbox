// Verifies that the *installed* Claude Code plugin matches `claude-plugin/`.
//
// Why this exists (#130): `/reload-plugins` and installing a plugin are
// different operations, and only one of them consults the marketplace. Reload
// re-reads whatever already sits in the version-keyed cache directory, can
// never pick up a new version no matter how many times it runs, and reports
// cheerful success either way. A `claude-plugin/` edit that ships without both
// a version bump AND an install therefore drifts silently: the repo says one
// thing and the agent is served another. That went unnoticed for five days.
//
// A silent no-op is the whole problem, so this script makes the drift noisy:
// it diffs every installed file against the canonical source and exits
// non-zero on the first mismatch, naming the file.
//
// Usage:  npm run verify:plugin
// Exit:   0 = installed tree matches source, 1 = drift (or nothing installed).

import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, relative } from "node:path";
import { homedir } from "node:os";
import { checkBundledServer } from "./lib/server-drift.mjs";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const pluginSrc = join(repoRoot, "claude-plugin");
const PLUGIN_KEY = "tidy-ds@tidy-ds-marketplace";

const RED = "\x1b[0;31m";
const GREEN = "\x1b[0;32m";
const YELLOW = "\x1b[1;33m";
const NC = "\x1b[0m";

const log = (m) => process.stdout.write(`[verify-plugin] ${m}\n`);

function fail(lines) {
  process.stderr.write(`\n${RED}✗ installed plugin does not match claude-plugin/${NC}\n\n`);
  for (const line of lines) process.stderr.write(`  ${line}\n`);
  process.stderr.write(
    `\n${YELLOW}Reload does not install.${NC} \`/reload-plugins\` only re-reads the\n` +
      `version-keyed cache; it can never pick up new files. Deliver the change with:\n\n` +
      `  npm run dogfood:plugin\n\n`,
  );
  process.exit(1);
}

// 1. What does Claude Code think is installed?
const installedRecordPath = join(homedir(), ".claude", "plugins", "installed_plugins.json");
if (!existsSync(installedRecordPath)) {
  fail([`no installed_plugins.json at ${installedRecordPath}; the plugin has never been installed.`]);
}
const record = JSON.parse(readFileSync(installedRecordPath, "utf8"));
const entries = record.plugins?.[PLUGIN_KEY];
if (!entries?.length) {
  fail([`${PLUGIN_KEY} is not listed in installed_plugins.json.`]);
}
const installed = entries[0];
// This metadata is informational only. `version` is unchanged by definition in
// a same-version reinstall, and `gitCommitSha` records the repo HEAD at install
// time, which says nothing about uncommitted edits to claude-plugin/. Only the
// per-file diff below is a verdict.
log(
  `installed: ${installed.version} (sha ${(installed.gitCommitSha ?? "unknown").slice(0, 7)}, ` +
    `updated ${(installed.lastUpdated ?? "?").slice(0, 10)})`,
);
log(`installPath: ${installed.installPath}`);

if (!existsSync(installed.installPath)) {
  fail([
    `installPath does not exist: ${installed.installPath}`,
    `The cache directory was removed but installed_plugins.json still points at it.`,
  ]);
}

// 2. The version the source tree *would* assemble to.
const rootVersion = JSON.parse(readFileSync(join(repoRoot, "package.json"), "utf8")).version;
const problems = [];
if (installed.version !== rootVersion) {
  problems.push(
    `version: installed ${installed.version}, source assembles to ${rootVersion}. ` +
      `These land in different cache directories, so the installed one is a stale copy.`,
  );
}

// 3. Diff every canonical file against its installed counterpart.
//
// plugin.json is compared with the version field normalised, because assemble
// stamps it from package.json, so a version difference is reported once, above,
// rather than once per byte.
function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const abs = join(dir, name);
    if (statSync(abs).isDirectory()) out.push(...walk(abs));
    else out.push(abs);
  }
  return out;
}

const sourceFiles = walk(pluginSrc);
let compared = 0;
for (const abs of sourceFiles) {
  const rel = relative(pluginSrc, abs);
  const installedFile = join(installed.installPath, rel);
  if (!existsSync(installedFile)) {
    problems.push(`missing from the installed tree: ${rel}`);
    continue;
  }
  let want = readFileSync(abs, "utf8");
  let got = readFileSync(installedFile, "utf8");
  if (rel.endsWith("plugin.json")) {
    const normalise = (s) => {
      const o = JSON.parse(s);
      delete o.version;
      return JSON.stringify(o);
    };
    want = normalise(want);
    got = normalise(got);
  }
  compared += 1;
  if (want !== got) {
    problems.push(
      `stale: ${rel} (installed copy differs from claude-plugin/${rel})`,
    );
  }
}

// 4. The bundled server is injected at assemble time, not copied from source,
//    so the per-file diff above has nothing to run it against. It is compared
//    instead against dist-plugin/, the last assembled build - see the
//    reasoning in lib/server-drift.mjs for why that target was chosen over a
//    rebuild here, and why a missing reference fails loudly rather than
//    skipping the check.
const bundledServer = join("mcp", "server.cjs");
const installedServerPath = join(installed.installPath, bundledServer);
const referenceServerPath = join(repoRoot, "dist-plugin", "tidy-ds", bundledServer);
const installedServerExists = existsSync(installedServerPath);
const referenceServerExists = existsSync(referenceServerPath);
problems.push(
  ...checkBundledServer({
    versionMatches: installed.version === rootVersion,
    installedExists: installedServerExists,
    referenceExists: referenceServerExists,
    installedBytes: installedServerExists ? readFileSync(installedServerPath) : null,
    referenceBytes: referenceServerExists ? readFileSync(referenceServerPath) : null,
  }),
);

// 5. The other direction. A command deleted or renamed in claude-plugin/ stays
//    in the cache and keeps being served, and a source-only walk would call
//    that a clean install. Anything present installed but absent from source
//    is drift too. The only legitimate extra is the injected server bundle.
const sourceRelPaths = new Set(sourceFiles.map((f) => relative(pluginSrc, f)));
sourceRelPaths.add(bundledServer);
for (const abs of walk(installed.installPath)) {
  const rel = relative(installed.installPath, abs);
  if (!sourceRelPaths.has(rel)) {
    problems.push(
      `orphaned in the installed tree: ${rel} (no longer exists in claude-plugin/, but is still served)`,
    );
  }
}

if (problems.length) fail(problems);

log(`${GREEN}✓ installed plugin matches claude-plugin/ (${compared} files, version ${rootVersion})${NC}`);
