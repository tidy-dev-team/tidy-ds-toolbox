// Shell state, as a pure module.
//
// The reducer used to post to the main thread from inside its own cases -
// persisting `activeModule`, persisting `bridgeMode`, and asking for a resize.
// A reducer that does I/O has two problems, and only one of them is style.
//
// The first is that React may invoke a reducer more than once per dispatch
// (StrictMode does exactly this in development), so a send written there is a
// send of unknown multiplicity. `main.tsx` wraps the app in StrictMode, so the
// storage writes were already doubling every time a designer changed module.
//
// The second is that it cannot be tested. There is no seam to stub, so the
// module was one of the few in `src/` with no test at all, and the bridge-mode
// transitions - which carry the only non-trivial derivation in the shell - were
// verified by hand or not at all.
//
// So the decision of *what to send* is separated from the act of sending it:
// `shellEffects` answers "given this state and this action, what should go to
// the main thread", and `shellReducer` answers "what is the next state". Both
// are pure and both are tested. `ShellContext.tsx` is what owns the sending,
// and is the only part that needs React.
//
// The two are kept in one file, and `shellEffects` takes the state *before* the
// action rather than after, because the bridge-mode derivation is shared: what
// gets persisted as `lastNormalSize` is the same value the reducer stores, and
// computing it twice from different inputs is how the panel and the storage
// would eventually disagree about what "normal" was. `nextLastNormalSize` is
// the single expression of it.

import type { PluginID, PluginMessage } from "./shared/types";
import { RESIZE_BRIDGE, RESIZE_DEFAULT } from "./shared/resize";

/**
 * A panel size. The pair travelled together in six places before this existed
 * - two state fields, two action payloads, and both ends of the bridge-mode
 * derivation - and `src/shared/resize.ts` already speaks in width and height.
 */
export interface Size {
  width: number;
  height: number;
}

export interface ShellState {
  activeModule: PluginID;
  featureFocus: string | null; // CSS selector for scrolling to a feature section
  windowSize: Size;
  bridgeMode: boolean;
  lastNormalSize: Size;
  theme: "light" | "dark";
  settings: Record<string, unknown>;
}

export type ShellAction =
  | { type: "SET_ACTIVE_MODULE"; payload: PluginID }
  | { type: "RESTORE_ACTIVE_MODULE"; payload: PluginID }
  | {
      type: "SET_FEATURE_FOCUS";
      payload: { pluginId: PluginID; section: string | null };
    }
  | { type: "CLEAR_FEATURE_FOCUS" }
  | { type: "SET_WINDOW_SIZE"; payload: Size }
  | { type: "ENTER_BRIDGE_MODE" }
  | { type: "EXIT_BRIDGE_MODE" }
  | { type: "RESTORE_BRIDGE_MODE"; payload: boolean }
  | { type: "RESTORE_LAST_NORMAL_SIZE"; payload: Size }
  | { type: "SET_THEME"; payload: "light" | "dark" }
  | { type: "UPDATE_SETTINGS"; payload: Record<string, unknown> };

export const initialState: ShellState = {
  activeModule: "ds-explorer",
  featureFocus: null,
  windowSize: { ...RESIZE_DEFAULT },
  bridgeMode: false,
  lastNormalSize: { ...RESIZE_DEFAULT },
  theme: "light",
  settings: {},
};

/**
 * The size to remember as "normal" when entering bridge mode.
 *
 * Entering from bridge mode must not overwrite the remembered size with the
 * bridge size - otherwise a second `ENTER_BRIDGE_MODE` (which the restore path
 * at mount can produce) would make bridge dimensions permanent, and exiting
 * would resize to the panel it was already showing.
 */
export function nextLastNormalSize(state: ShellState): Size {
  return state.bridgeMode ? state.lastNormalSize : state.windowSize;
}

function saveStorage(key: string, value: unknown): PluginMessage {
  return {
    target: "shell",
    action: "save-storage",
    payload: { key, value },
  };
}

/**
 * Tells the main thread a module stopped showing, so it can drop the document
 * listeners that module installed. See `src/shared/module-listeners.ts` for what
 * was wrong without it.
 *
 * The shell is the right place to say this because it is the only part that
 * knows: a module cannot notice it is no longer on screen, and the four that
 * needed to know were each guessing from their own panel's lifecycle or, in
 * three cases, not guessing at all.
 *
 * Emitted only when the module actually changed. Announcing it for a navigation
 * that stays put - clicking the active tab, or a feature jump inside the current
 * module - would tear down the listeners of the module still on screen, and
 * nothing would reinstall them until its next message.
 */
function moduleDeactivated(from: PluginID, to: PluginID): PluginMessage[] {
  if (from === to) return [];
  return [
    {
      target: "shell",
      action: "module-deactivated",
      payload: { moduleId: from },
    },
  ];
}

/**
 * What this action should send to the main thread, given the state it acts on.
 *
 * Takes the state *before* the action. Every caller dispatches immediately
 * after, so "before" is the state that is actually to hand, and it keeps this
 * function independent of the reducer rather than chained behind it.
 *
 * The `RESTORE_*` actions deliberately persist nothing: they exist to bring
 * stored values back into state, and writing them again on the way in would be a
 * write for every read. `RESTORE_ACTIVE_MODULE` still announces a deactivation,
 * because that is not a write and the restore is a real module change - the panel
 * renders the default module before storage answers, so the default has had a
 * chance to install listeners.
 */
export function shellEffects(
  state: ShellState,
  action: ShellAction,
): PluginMessage[] {
  switch (action.type) {
    case "SET_ACTIVE_MODULE":
      return [
        ...moduleDeactivated(state.activeModule, action.payload),
        saveStorage("activeModule", action.payload),
      ];
    case "SET_FEATURE_FOCUS":
      return [
        ...moduleDeactivated(state.activeModule, action.payload.pluginId),
        saveStorage("activeModule", action.payload.pluginId),
      ];
    case "RESTORE_ACTIVE_MODULE":
      return moduleDeactivated(state.activeModule, action.payload);
    case "ENTER_BRIDGE_MODE":
      return [
        saveStorage("bridgeMode", true),
        saveStorage("lastNormalSize", nextLastNormalSize(state)),
        {
          target: "shell",
          action: "resize-ui",
          payload: { ...RESIZE_BRIDGE, mode: "bridge" },
        },
      ];
    case "EXIT_BRIDGE_MODE":
      return [
        saveStorage("bridgeMode", false),
        {
          target: "shell",
          action: "resize-ui",
          payload: { ...state.lastNormalSize, mode: "default" },
        },
      ];
    default:
      return [];
  }
}

export function shellReducer(
  state: ShellState,
  action: ShellAction,
): ShellState {
  switch (action.type) {
    case "SET_ACTIVE_MODULE":
      return { ...state, activeModule: action.payload, featureFocus: null };
    case "RESTORE_ACTIVE_MODULE":
      // Restore from storage without re-saving
      return { ...state, activeModule: action.payload };
    case "SET_FEATURE_FOCUS":
      return {
        ...state,
        activeModule: action.payload.pluginId,
        featureFocus: action.payload.section,
      };
    case "CLEAR_FEATURE_FOCUS":
      return { ...state, featureFocus: null };
    case "SET_WINDOW_SIZE": {
      const next = { ...state, windowSize: action.payload };
      // Only the user-driven non-bridge size counts as "normal"
      if (!state.bridgeMode) {
        next.lastNormalSize = action.payload;
      }
      return next;
    }
    case "ENTER_BRIDGE_MODE":
      return {
        ...state,
        bridgeMode: true,
        lastNormalSize: nextLastNormalSize(state),
        windowSize: { ...RESIZE_BRIDGE },
      };
    case "EXIT_BRIDGE_MODE":
      return {
        ...state,
        bridgeMode: false,
        windowSize: { ...state.lastNormalSize },
      };
    case "RESTORE_BRIDGE_MODE":
      return { ...state, bridgeMode: action.payload };
    case "RESTORE_LAST_NORMAL_SIZE": {
      // Update lastNormalSize regardless of current bridgeMode so the
      // restore order between bridgeMode and lastNormalSize doesn't matter.
      const next: ShellState = { ...state, lastNormalSize: action.payload };
      if (!state.bridgeMode) {
        next.windowSize = action.payload;
      }
      return next;
    }
    case "SET_THEME":
      return { ...state, theme: action.payload };
    case "UPDATE_SETTINGS":
      return { ...state, settings: { ...state.settings, ...action.payload } };
    default:
      return state;
  }
}

/**
 * One action: what to send, and the state it leaves behind.
 *
 * The provider drives the shell through this rather than calling the reducer and
 * `shellEffects` separately, because the two have to see the *same* input state
 * and that is easy to get wrong once more than one action is dispatched before a
 * re-render.
 *
 * React batches dispatches inside a single event handler into one re-render, so
 * a provider that read its pre-action state from a ref refreshed during render
 * would hand the second action the state from before the batch. The effect for
 * that action would then be computed from a state the reducer had already moved
 * past - `RESTORE_LAST_NORMAL_SIZE` followed by `ENTER_BRIDGE_MODE` in one tick
 * would persist the stale size, which is exactly the value a later reload
 * restores from. The old in-reducer sends did not have this problem, because
 * reducers chain and each case saw the previous case's output.
 *
 * Returning `next` is what lets the caller keep its own record in lockstep with
 * the action sequence instead of with the render schedule.
 */
export function stepShell(
  state: ShellState,
  action: ShellAction,
): { next: ShellState; send: PluginMessage[] } {
  return {
    next: shellReducer(state, action),
    send: shellEffects(state, action),
  };
}
