// The local dogfood loop: assemble → force-refresh the cache → install → verify.
//
// Why the force-refresh (#130): the Claude Code plugin cache is keyed on the
// version string (`~/.claude/plugins/cache/<marketplace>/<plugin>/<version>/`).
// Reinstalling at an unchanged version leaves the existing directory in place,
// so a `claude-plugin/` edit never reaches the agent. The fix is NOT "bump the
// version on every prompt-wording tweak". That couples every doc change to a
// release, which is how the drift started. Instead this deletes the versioned
// cache directory first, so the install has to re-copy from the marketplace.
//
// It ends with the verification step, so the loop can never report success
// while serving stale files.
//
// Usage:  npm run dogfood:plugin

import { execFileSync } from "node:child_process";
import { readFileSync, rmSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import { homedir } from "node:os";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const distPlugin = join(repoRoot, "dist-plugin");
const MARKETPLACE = "tidy-ds-marketplace";
const PLUGIN = "tidy-ds";

const YELLOW = "\x1b[1;33m";
const NC = "\x1b[0m";
const log = (m) => process.stdout.write(`[dogfood-plugin] ${m}\n`);
const run = (cmd, args) => execFileSync(cmd, args, { stdio: "inherit", cwd: repoRoot });

// 1. Assemble dist-plugin/ from the canonical source.
log("assembling dist-plugin/…");
run(process.execPath, [join(repoRoot, "scripts", "assemble-plugin.mjs")]);

const version = JSON.parse(readFileSync(join(repoRoot, "package.json"), "utf8")).version;

// 2. Drop the version-keyed cache directory. Without this the install is a
//    silent no-op whenever the version has not changed.
const cacheDir = join(homedir(), ".claude", "plugins", "cache", MARKETPLACE, PLUGIN, version);
if (existsSync(cacheDir)) {
  log(`clearing stale cache: ${cacheDir}`);
  rmSync(cacheDir, { recursive: true, force: true });
} else {
  log(`no cache directory for ${version} yet, nothing to clear`);
}

// 3. Point the marketplace at this repo's dist-plugin, then install from it.
const knownPath = join(homedir(), ".claude", "plugins", "known_marketplaces.json");
const known = existsSync(knownPath) ? JSON.parse(readFileSync(knownPath, "utf8")) : {};
const registered = known[MARKETPLACE]?.installLocation;

if (!registered) {
  log(`registering marketplace from ${distPlugin}…`);
  run("claude", ["plugin", "marketplace", "add", distPlugin, "--scope", "user"]);
} else {
  if (resolve(registered) !== resolve(distPlugin)) {
    process.stdout.write(
      `${YELLOW}! ${MARKETPLACE} is registered against ${registered}, not this repo's` +
        ` dist-plugin. Installing from there, which is probably not what you want.${NC}\n`,
    );
  }
  log("refreshing marketplace…");
  run("claude", ["plugin", "marketplace", "update", MARKETPLACE]);
}

log(`installing ${PLUGIN}@${MARKETPLACE}…`);
run("claude", ["plugin", "install", `${PLUGIN}@${MARKETPLACE}`]);

// 4. Prove it landed. This is the step that makes a silent no-op impossible.
run(process.execPath, [join(repoRoot, "scripts", "verify-installed-plugin.mjs")]);

log("restart Claude Code (or start a new session) to pick up the new commands.");
