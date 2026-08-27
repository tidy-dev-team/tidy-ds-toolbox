import { describe, it, expect } from "vitest";
import { RESIZE_BRIDGE } from "./shared/resize";
import {
  initialState,
  shellEffects,
  shellReducer,
  stepShell,
  type ShellAction,
  type ShellState,
} from "./shellState";

const NORMAL = { width: 1024, height: 768 };
const RESIZED = { width: 640, height: 480 };

function stateWith(overrides: Partial<ShellState>): ShellState {
  return { ...initialState, ...overrides };
}

describe("shellReducer", () => {
  // The reducer used to call postToFigma, which reaches `parent.postMessage`.
  // Under Vitest's node environment there is no `parent`, so this file could
  // not have existed at all before the sends moved out. Calling every action
  // here is the regression test for that: if I/O returns to the reducer, this
  // throws rather than silently doubling writes in the app.
  it("runs every action with no DOM and no plugin bridge available", () => {
    expect(typeof (globalThis as { parent?: unknown }).parent).toBe(
      "undefined",
    );
    const actions = [
      { type: "SET_ACTIVE_MODULE", payload: "audit" },
      { type: "RESTORE_ACTIVE_MODULE", payload: "audit" },
      {
        type: "SET_FEATURE_FOCUS",
        payload: { pluginId: "audit", section: null },
      },
      { type: "CLEAR_FEATURE_FOCUS" },
      { type: "SET_WINDOW_SIZE", payload: RESIZED },
      { type: "ENTER_BRIDGE_MODE" },
      { type: "EXIT_BRIDGE_MODE" },
      { type: "RESTORE_BRIDGE_MODE", payload: true },
      { type: "RESTORE_LAST_NORMAL_SIZE", payload: RESIZED },
      { type: "SET_THEME", payload: "dark" },
      { type: "UPDATE_SETTINGS", payload: { a: 1 } },
    ] as const;

    for (const action of actions) {
      expect(() => shellReducer(initialState, action)).not.toThrow();
    }
  });

  it("does not mutate the state it is given", () => {
    const before = stateWith({ windowSize: RESIZED });
    const snapshot = JSON.stringify(before);
    shellReducer(before, { type: "ENTER_BRIDGE_MODE" });
    expect(JSON.stringify(before)).toBe(snapshot);
  });

  it("clears the feature focus when the module changes by hand", () => {
    const focused = stateWith({ featureFocus: "[data-feature='report']" });
    const next = shellReducer(focused, {
      type: "SET_ACTIVE_MODULE",
      payload: "audit",
    });
    expect(next.activeModule).toBe("audit");
    expect(next.featureFocus).toBeNull();
  });

  it("keeps the feature focus when the module changes to reach a feature", () => {
    const next = shellReducer(initialState, {
      type: "SET_FEATURE_FOCUS",
      payload: { pluginId: "audit", section: "[data-feature='report']" },
    });
    expect(next.activeModule).toBe("audit");
    expect(next.featureFocus).toBe("[data-feature='report']");
  });
});

describe("bridge mode", () => {
  it("remembers the panel size on the way in and restores it on the way out", () => {
    const sized = stateWith({ windowSize: RESIZED, lastNormalSize: RESIZED });

    const entered = shellReducer(sized, { type: "ENTER_BRIDGE_MODE" });
    expect(entered.bridgeMode).toBe(true);
    expect(entered.windowSize).toEqual(RESIZE_BRIDGE);
    expect(entered.lastNormalSize).toEqual(RESIZED);

    const exited = shellReducer(entered, { type: "EXIT_BRIDGE_MODE" });
    expect(exited.bridgeMode).toBe(false);
    expect(exited.windowSize).toEqual(RESIZED);
  });

  // The restore path at mount dispatches ENTER_BRIDGE_MODE against a state
  // that may already be in bridge mode. Deriving lastNormalSize from
  // windowSize unconditionally would bake the bridge dimensions in as
  // "normal", and exiting would then resize to the bridge panel it was
  // already showing.
  it("entering twice does not make the bridge size the normal size", () => {
    const first = shellReducer(
      stateWith({ windowSize: RESIZED, lastNormalSize: RESIZED }),
      { type: "ENTER_BRIDGE_MODE" },
    );
    const second = shellReducer(first, { type: "ENTER_BRIDGE_MODE" });

    expect(second.lastNormalSize).toEqual(RESIZED);
    expect(
      shellReducer(second, { type: "EXIT_BRIDGE_MODE" }).windowSize,
    ).toEqual(RESIZED);
  });

  it("a resize while in bridge mode is not remembered as the normal size", () => {
    const inBridge = stateWith({
      bridgeMode: true,
      lastNormalSize: NORMAL,
      windowSize: RESIZE_BRIDGE,
    });
    const next = shellReducer(inBridge, {
      type: "SET_WINDOW_SIZE",
      payload: RESIZED,
    });
    expect(next.windowSize).toEqual(RESIZED);
    expect(next.lastNormalSize).toEqual(NORMAL);
  });

  it("restores lastNormalSize whatever order the two restores arrive in", () => {
    const sizeFirst = shellReducer(
      shellReducer(initialState, {
        type: "RESTORE_LAST_NORMAL_SIZE",
        payload: RESIZED,
      }),
      { type: "RESTORE_BRIDGE_MODE", payload: true },
    );
    const modeFirst = shellReducer(
      shellReducer(initialState, {
        type: "RESTORE_BRIDGE_MODE",
        payload: true,
      }),
      { type: "RESTORE_LAST_NORMAL_SIZE", payload: RESIZED },
    );

    expect(sizeFirst.lastNormalSize).toEqual(RESIZED);
    expect(modeFirst.lastNormalSize).toEqual(RESIZED);
  });
});

describe("shellEffects", () => {
  it("persists the module the user picked, and says which one it left", () => {
    expect(
      shellEffects(initialState, {
        type: "SET_ACTIVE_MODULE",
        payload: "audit",
      }),
    ).toEqual([
      {
        target: "shell",
        action: "module-deactivated",
        payload: { moduleId: "ds-explorer" },
      },
      {
        target: "shell",
        action: "save-storage",
        payload: { key: "activeModule", value: "audit" },
      },
    ]);
  });

  it("says nothing about deactivation when the module has not changed", () => {
    // Clicking the tab that is already showing. Announcing a deactivation here
    // would tear down the listeners of the module still on screen, and nothing
    // would put them back until its next message - which for a passive module
    // is never.
    expect(
      shellEffects(stateWith({ activeModule: "audit" }), {
        type: "SET_ACTIVE_MODULE",
        payload: "audit",
      }),
    ).toEqual([
      {
        target: "shell",
        action: "save-storage",
        payload: { key: "activeModule", value: "audit" },
      },
    ]);
  });

  it("announces deactivation when a feature jump changes module too", () => {
    // The other action that navigates. It was the one that would have been
    // forgotten, because it looks like it is about scrolling.
    const effects = shellEffects(stateWith({ activeModule: "audit" }), {
      type: "SET_FEATURE_FOCUS",
      payload: { pluginId: "iconfinder", section: "[data-feature='search']" },
    });

    expect(effects).toContainEqual({
      target: "shell",
      action: "module-deactivated",
      payload: { moduleId: "audit" },
    });
  });

  it("says nothing about deactivation for a feature jump within one module", () => {
    const effects = shellEffects(stateWith({ activeModule: "audit" }), {
      type: "SET_FEATURE_FOCUS",
      payload: { pluginId: "audit", section: "[data-feature='report']" },
    });

    expect(effects.map((e) => e.action)).toEqual(["save-storage"]);
  });

  it("persists nothing for the restore actions", () => {
    const restores = [
      { type: "RESTORE_ACTIVE_MODULE", payload: "audit" },
      { type: "RESTORE_BRIDGE_MODE", payload: true },
      { type: "RESTORE_LAST_NORMAL_SIZE", payload: RESIZED },
    ] as const;

    for (const action of restores) {
      expect(
        shellEffects(initialState, action).filter(
          (e) => e.action === "save-storage",
        ),
      ).toEqual([]);
    }
  });

  it("announces deactivation when a restore moves off the default module", () => {
    // The restore at mount is a module change like any other: the panel renders
    // the default module before storage answers, so whatever that default is has
    // had a chance to install listeners. Today no module with listeners is the
    // default, which is luck rather than a guarantee.
    expect(
      shellEffects(initialState, {
        type: "RESTORE_ACTIVE_MODULE",
        payload: "audit",
      }),
    ).toEqual([
      {
        target: "shell",
        action: "module-deactivated",
        payload: { moduleId: "ds-explorer" },
      },
    ]);
  });

  it("announces nothing when the restore lands on the module already showing", () => {
    // The common case: storage agrees with the default, so nothing moved.
    expect(
      shellEffects(initialState, {
        type: "RESTORE_ACTIVE_MODULE",
        payload: initialState.activeModule,
      }),
    ).toEqual([]);
  });

  it("sends nothing for state that only lives in the panel", () => {
    expect(
      shellEffects(initialState, { type: "SET_THEME", payload: "dark" }),
    ).toEqual([]);
    expect(
      shellEffects(initialState, {
        type: "SET_WINDOW_SIZE",
        payload: RESIZED,
      }),
    ).toEqual([]);
  });

  // The value written to storage and the value kept in state have to be the
  // same one. If they ever diverge, a reload restores a size the panel never
  // had - which is exactly the bug that is invisible until someone reopens
  // the plugin the next day.
  it("persists the same lastNormalSize the reducer stores", () => {
    const sized = stateWith({ windowSize: RESIZED, lastNormalSize: NORMAL });
    const effects = shellEffects(sized, { type: "ENTER_BRIDGE_MODE" });
    const stored = effects.find(
      (m) => (m.payload as { key?: string })?.key === "lastNormalSize",
    );
    const next = shellReducer(sized, { type: "ENTER_BRIDGE_MODE" });

    expect((stored?.payload as { value: unknown }).value).toEqual(
      next.lastNormalSize,
    );
    expect(next.lastNormalSize).toEqual(RESIZED);
  });

  it("asks for the remembered size when leaving bridge mode", () => {
    const inBridge = stateWith({ bridgeMode: true, lastNormalSize: RESIZED });
    const effects = shellEffects(inBridge, { type: "EXIT_BRIDGE_MODE" });

    expect(effects).toEqual([
      {
        target: "shell",
        action: "save-storage",
        payload: { key: "bridgeMode", value: false },
      },
      {
        target: "shell",
        action: "resize-ui",
        payload: { ...RESIZED, mode: "default" },
      },
    ]);
  });
});

// Several actions dispatched before a re-render.
//
// React batches dispatches inside one event handler, so the provider cannot get
// its pre-action state from a ref refreshed during render - the second action
// would be handed the state from before the batch. `stepShell` returns the next
// state so the provider can advance its own record per action, and these drive
// exactly that loop.
describe("a batch of actions in one tick", () => {
  /** What the provider does, minus React: step each action, collect the sends. */
  function runBatch(from: ShellState, actions: readonly ShellAction[]) {
    let state = from;
    const sent = [];
    for (const action of actions) {
      const { next, send } = stepShell(state, action);
      state = next;
      sent.push(...send);
    }
    return { state, sent };
  }

  function storedValue(sent: { payload?: unknown }[], key: string) {
    const hit = sent.find((m) => (m.payload as { key?: string })?.key === key);
    return (hit?.payload as { value: unknown } | undefined)?.value;
  }

  // The restore path is the reachable case. Both stored values arrive as
  // replies, and if two ever land in one tick the second must see the first.
  it("persists the size restored earlier in the same batch, not the pre-batch one", () => {
    const { state, sent } = runBatch(initialState, [
      { type: "RESTORE_LAST_NORMAL_SIZE", payload: RESIZED },
      { type: "ENTER_BRIDGE_MODE" },
    ]);

    expect(storedValue(sent, "lastNormalSize")).toEqual(RESIZED);
    expect(state.lastNormalSize).toEqual(RESIZED);
    // And the value that was persisted is the one a reload would restore.
    expect(storedValue(sent, "lastNormalSize")).toEqual(state.lastNormalSize);
  });

  it("keeps what it sent and what it stored in step across a bridge round trip", () => {
    const { state, sent } = runBatch(
      stateWith({ windowSize: RESIZED, lastNormalSize: RESIZED }),
      [{ type: "ENTER_BRIDGE_MODE" }, { type: "EXIT_BRIDGE_MODE" }],
    );

    expect(state.bridgeMode).toBe(false);
    expect(state.windowSize).toEqual(RESIZED);
    // The last resize asked for is the size the panel actually ends up at.
    const resizes = sent.filter((m) => m.action === "resize-ui");
    expect(resizes[resizes.length - 1]?.payload).toEqual({
      ...RESIZED,
      mode: "default",
    });
  });

  it("sends each of an action's messages exactly once", () => {
    const { sent } = runBatch(initialState, [
      { type: "SET_THEME", payload: "dark" },
      { type: "SET_ACTIVE_MODULE", payload: "audit" },
      { type: "CLEAR_FEATURE_FOCUS" },
    ]);
    // Only SET_ACTIVE_MODULE sends anything, and it sends two different things:
    // the module it left, then the module to remember. Counting each kind rather
    // than the total is what keeps this a test about *doubling* - the StrictMode
    // failure this file exists for - now that one action legitimately sends two.
    expect(sent.filter((m) => m.action === "module-deactivated")).toHaveLength(
      1,
    );
    expect(sent.filter((m) => m.action === "save-storage")).toHaveLength(1);
    expect(storedValue(sent, "activeModule")).toBe("audit");
  });
});
