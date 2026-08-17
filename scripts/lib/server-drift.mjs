/**
 * Whether the installed `mcp/server.cjs` matches the one this repo builds
 * (#191). The bundled server is not in `claude-plugin/` - it is produced by
 * `mcp-server/build.js` and injected at assemble time - so the per-file diff
 * that covers the rest of the installed tree has nothing to compare it
 * against, and the check that shipped alongside that diff was presence-only.
 * A `server.cjs` that is present but months old, at an unchanged version,
 * passed. Version drift is already caught elsewhere in the same script; this
 * is specifically the case a version bump does not catch.
 *
 * Comparison target: `dist-plugin/tidy-ds/mcp/server.cjs`, not a rebuild from
 * source. Rebuilding on every `verify:plugin` run would be more honest - it
 * can never be behind - but it gives a read-only diagnostic a build-shaped
 * side effect, and the one thing this script must stay is safe to run "just
 * to check". The tradeoff is real: this comparison is only as fresh as the
 * last `npm run build:plugin`. The main caller, `npm run dogfood:plugin`,
 * always assembles immediately beforehand, so on the primary path the
 * comparison is against a build made seconds earlier. A missing reference
 * fails loudly rather than skipping, so a verify run with no dist-plugin/
 * yet cannot be mistaken for a pass. esbuild's output is deterministic for
 * the same source and options, so a plain byte comparison is sound - no
 * whitespace or key-order normalisation is needed here the way plugin.json
 * needs its version field stripped.
 *
 * Byte drift is only reported when the versions already agree. A version bump
 * changes the bundle by itself, because `build.js` stamps `__SERVER_VERSION__`
 * into it (#189), so a mismatched version would otherwise raise two problems
 * for one cause - and the drift wording would contradict the version line
 * printed directly above it. The per-file diff solves the same problem the
 * same way, stripping `version` from `plugin.json` before comparing so a
 * version difference is reported once.
 *
 * Pure: takes bytes, returns problem strings. Reading files and choosing
 * which path to read stays in the calling script.
 */
export function checkBundledServer({
  versionMatches,
  installedExists,
  referenceExists,
  installedBytes,
  referenceBytes,
}) {
  if (!installedExists) {
    return ["missing from the installed tree: mcp/server.cjs (the bundled MCP server)"];
  }
  if (!referenceExists) {
    return [
      "cannot verify mcp/server.cjs: no dist-plugin/tidy-ds/mcp/server.cjs to compare " +
        "against. Run `npm run build:plugin` first, then re-run verify:plugin.",
    ];
  }
  // Absence is worth reporting whatever the version says; drift is not.
  if (!versionMatches) {
    return [];
  }
  if (!installedBytes.equals(referenceBytes)) {
    return [
      "stale: mcp/server.cjs (installed copy differs from the dist-plugin/ build; " +
        "the plugin.json version matches, so this is content drift, not a version bump)",
    ];
  }
  return [];
}
