/// <reference types="@figma/plugin-typings" />

/**
 * Document event listeners that belong to a module, and go away with it.
 *
 * Four modules registered `figma.on` handlers behind a module-level
 * `listenersRegistered` boolean that was never reset, and nothing anywhere in
 * `src/` ever called `figma.off`. A handler installed by visiting a tab
 * therefore ran for the rest of the plugin session, whatever module was
 * showing.
 *
 * That was not only a cost. `tidy-mapper` installs a `selectionchange` handler
 * that *writes*: it renames every selected `SLICE` to the name the module is
 * holding, which defaults to "Avatar". Its handler was installed from the top of
 * its message handler, and its panel posts a message on mount, so opening the
 * Tidy Mapper tab once - not using it, opening it - was enough to have every
 * slice the designer selected afterwards silently renamed, in any module, until
 * they closed the plugin.
 *
 * `iconfinder` was the only module that had noticed, and it worked around it
 * from the other end: its panel posts a `stop` action on unmount and its handler
 * gates on an `isActive` flag. That guard is a second mechanism answering the
 * question this one answers, so it goes with this change rather than being
 * copied three more times.
 *
 * The shell is what knows a module stopped showing, so the shell is what says
 * so: `shellEffects` emits `module-deactivated` naming the module it just
 * navigated away from, and `code.ts` routes it to `deactivateModule` below.
 * Nothing here asks a module to remember to tear itself down.
 */

/**
 * One listener, kept as data.
 *
 * Data rather than a closure over `figma.on` because `figma.off` matches on
 * function identity: detaching needs the very reference that was attached, and
 * the surest way to keep them together is to never separate them. The union is
 * closed over the event kinds the modules actually use, which is also what keeps
 * this typed without an `any` at the `figma.on` overloads.
 */
export type ListenerBinding =
  | { type: "selectionchange" | "currentpagechange"; handler: () => void }
  | { type: "run"; handler: (event: RunEvent) => void }
  | { type: "documentchange"; handler: (event: DocumentChangeEvent) => void };

/** The attach/detach pair, injected so the registry is testable without Figma. */
export interface ListenerEnv {
  on(binding: ListenerBinding): void;
  off(binding: ListenerBinding): void;
}

export const figmaListenerEnv: ListenerEnv = {
  on(binding) {
    switch (binding.type) {
      case "selectionchange":
      case "currentpagechange":
        figma.on(binding.type, binding.handler);
        return;
      case "run":
        figma.on("run", binding.handler);
        return;
      case "documentchange":
        figma.on("documentchange", binding.handler);
        return;
    }
  },
  off(binding) {
    switch (binding.type) {
      case "selectionchange":
      case "currentpagechange":
        figma.off(binding.type, binding.handler);
        return;
      case "run":
        figma.off("run", binding.handler);
        return;
      case "documentchange":
        figma.off("documentchange", binding.handler);
        return;
    }
  },
};

export interface ModuleListeners {
  /**
   * Installs the module's listeners, once.
   *
   * Safe to call from the top of a message handler, which is where all four
   * modules call it: while the listeners are installed this does nothing, so a
   * module that receives twenty actions still has one handler per event rather
   * than twenty. `install` is a callback rather than an array so a module that
   * is already installed does not build bindings nobody will attach.
   */
  ensure(install: () => ListenerBinding[]): void;
}

/**
 * Who has listeners installed right now, and how to remove them.
 *
 * Module-level state, like the `listenersRegistered` booleans it replaces. The
 * difference is that this one can be cleared, and that one place clears all of
 * them.
 */
interface Installed {
  bindings: ListenerBinding[];
  /**
   * The env the module attached through, kept so the detach goes back the same
   * way. Otherwise `deactivateModule` would need the env passed in, and its one
   * production caller - the shell command in `code.ts` - has no business knowing
   * that this is injectable at all.
   */
  env: ListenerEnv;
}

const installed = new Map<string, Installed>();

export function createModuleListeners(
  moduleId: string,
  env: ListenerEnv = figmaListenerEnv,
): ModuleListeners {
  return {
    ensure(install) {
      if (installed.has(moduleId)) return;
      const bindings = install();
      // Recorded before attaching, so a throw part-way through leaves the
      // bindings that did attach reachable by `deactivateModule` rather than
      // stranded with no way to name them.
      installed.set(moduleId, { bindings, env });
      for (const binding of bindings) env.on(binding);
    },
  };
}

/**
 * Removes every listener a module installed, and lets it install again later.
 *
 * Called for every deactivation the shell announces, which is mostly modules
 * that installed nothing - so an unknown id is the ordinary case, not an error.
 *
 * A failing detach is logged and swallowed, and the rest still run. Same
 * reasoning as the QA probe sweep: one listener that cannot be removed must not
 * strand the others, because a stranded listener is the entire bug.
 */
export function deactivateModule(moduleId: string): void {
  const entry = installed.get(moduleId);
  if (!entry) return;
  const { bindings, env } = entry;
  // Cleared first, so a module whose detach throws can still re-install rather
  // than being locked out for the session by its own failure.
  installed.delete(moduleId);
  for (const binding of bindings) {
    try {
      env.off(binding);
    } catch (error) {
      console.warn(
        `[shell] could not remove ${moduleId}'s ${binding.type} listener`,
        error,
      );
    }
  }
}
