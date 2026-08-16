// What to say about the two halves of the Bridge when a plugin attaches (#189).
//
// Both halves ship from one repo and one build, and the code assumes it - #183's
// envelope union treats a missing discriminator as version skew rather than a
// shape to accommodate. Nothing checked the assumption, and it is easier to
// break than it looks, because the two reload paths are not symmetric: the
// plugin reloads when a designer reopens it in Figma, while the server is a
// process spawned at session start and keeps serving its own binary no matter
// what is rebuilt on disk.
//
// That asymmetry is not hypothetical. A session ran three tickets' worth of
// server work against a binary from before any of them, and the only reason it
// was noticed is that one of those tickets changed a user-visible string.

/**
 * The version a server reports when it is running straight from TypeScript
 * (`npm run mcp:server`) rather than from a bundle.
 *
 * There is no build step on that path to stamp a version into, so there is
 * nothing to compare. Saying so is the honest answer; calling it a mismatch
 * would warn on every connect of the dev inner loop, and a warning that is
 * always on is one nobody reads.
 */
export const RAW_SOURCE_VERSION = "source";

/**
 * Injected by `mcp-server/build.js` from the root `package.json`, which is the
 * same single source the UI's `__APP_VERSION__` and the assembled plugin's
 * manifest already take theirs from. Declared rather than imported because the
 * bundle runs from anywhere and cannot reliably find the repo's package.json at
 * runtime.
 */
declare const __SERVER_VERSION__: string | undefined;

/**
 * This server's build version, or `RAW_SOURCE_VERSION` when there was no build
 * step to stamp one - `typeof` on an undeclared identifier is safe, so the raw
 * TypeScript path falls through here rather than throwing.
 */
export const SERVER_VERSION: string =
  typeof __SERVER_VERSION__ === "string"
    ? __SERVER_VERSION__
    : RAW_SOURCE_VERSION;

/**
 * One log line describing whether the plugin and the server are the same build.
 *
 * Pure - no socket, no process, no filesystem.
 *
 * The versions are attributed to their halves rather than printed as a bare
 * pair. Which end is behind is the entire question a reader has, and
 * `1.16.0 / 1.17.2` does not answer it.
 */
export function describeVersionMatch(
  serverVersion: string,
  pluginVersion: string | undefined,
): string {
  // Checked first, and before the missing-version case: a raw-source server
  // cannot compare against anything, so what the plugin said does not change
  // the answer.
  if (serverVersion === RAW_SOURCE_VERSION) {
    const against = pluginVersion
      ? `against the plugin's ${pluginVersion}`
      : "and the plugin reported none either";
    return (
      `server is running from raw source, so there is no version to compare ${against}. ` +
      `Restart the session if server code has changed since it started.`
    );
  }

  if (!pluginVersion) {
    return (
      `plugin did not report a version, so it predates this check and is older ` +
      `than the server (${serverVersion}). Reopen the plugin in Figma to pick up the current build.`
    );
  }

  if (pluginVersion === serverVersion) {
    return `plugin and server both on ${serverVersion}`;
  }

  return (
    `VERSION MISMATCH: the server is on ${serverVersion} and the plugin is on ${pluginVersion}. ` +
    `Both halves ship from one build, so one of them is stale. ` +
    `A rebuilt server keeps serving its old binary until the Claude Code session restarts; ` +
    `the plugin picks up a new build when it is reopened in Figma.`
  );
}
