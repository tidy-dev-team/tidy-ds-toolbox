/**
 * Which `claude plugin` verb actually delivers the assembled build (#190).
 *
 * Three cases, and the middle one is the whole reason this exists.
 *
 * The cache is keyed on the version string, so a *same-version* reinstall finds
 * the directory already there and leaves it alone - that is #130, and deleting
 * the directory first is what forces the re-copy. But a *different*-version
 * install is refused outright: `claude plugin install` sees the plugin
 * registered and reports "already installed", so nothing happens at all. The
 * cache-clearing trick cannot help there, because the directory it would clear
 * is the new version's, which does not exist yet.
 *
 * `update` is the verb for that case, and the script did not use it. An install
 * seventeen days and one version stale went unnoticed as a result (#190).
 *
 * Pure: no child process, no filesystem. The dogfood script does the running.
 */
export function planInstallStep({ installedVersion, assemblingVersion }) {
  if (!installedVersion) {
    return {
      verb: "install",
      clearCache: false,
      reason: `not installed yet; installing ${assemblingVersion}`,
    };
  }
  if (installedVersion === assemblingVersion) {
    return {
      verb: "install",
      clearCache: true,
      reason:
        `already at ${assemblingVersion}; clearing the version-keyed cache first, ` +
        `because a same-version install would otherwise be a silent no-op`,
    };
  }
  return {
    verb: "update",
    clearCache: false,
    reason:
      `installed ${installedVersion}, assembling ${assemblingVersion}; ` +
      `updating, because install refuses a plugin that is already registered`,
  };
}
