import { describe, it, expect } from "vitest";
import { RESIZE_BRIDGE } from "./shared/resize";
import {
  initialState,
  shellEffects,
  shellReducer,
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
  it("persists the module the user picked", () => {
    expect(
      shellEffects(initialState, {
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

  it("sends nothing for the restore actions", () => {
    const restores = [
      { type: "RESTORE_ACTIVE_MODULE", payload: "audit" },
      { type: "RESTORE_BRIDGE_MODE", payload: true },
      { type: "RESTORE_LAST_NORMAL_SIZE", payload: RESIZED },
    ] as const;

    for (const action of restores) {
      expect(shellEffects(initialState, action)).toEqual([]);
    }
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
