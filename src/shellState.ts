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

export interface ShellState {
  activeModule: PluginID;
  featureFocus: string | null; // CSS selector for scrolling to a feature section
  windowSize: { width: number; height: number };
  bridgeMode: boolean;
  lastNormalSize: { width: number; height: number };
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
  | { type: "SET_WINDOW_SIZE"; payload: { width: number; height: number } }
  | { type: "ENTER_BRIDGE_MODE" }
  | { type: "EXIT_BRIDGE_MODE" }
  | { type: "RESTORE_BRIDGE_MODE"; payload: boolean }
  | {
      type: "RESTORE_LAST_NORMAL_SIZE";
      payload: { width: number; height: number };
    }
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
export function nextLastNormalSize(state: ShellState): {
  width: number;
  height: number;
} {
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
 * What this action should send to the main thread, given the state it acts on.
 *
 * Takes the state *before* the action. Every caller dispatches immediately
 * after, so "before" is the state that is actually to hand, and it keeps this
 * function independent of the reducer rather than chained behind it.
 *
 * The `RESTORE_*` actions deliberately send nothing: they exist to bring stored
 * values back into state, and persisting them again on the way in would be a
 * write for every read.
 */
export function shellEffects(
  state: ShellState,
  action: ShellAction,
): PluginMessage[] {
  switch (action.type) {
    case "SET_ACTIVE_MODULE":
      return [saveStorage("activeModule", action.payload)];
    case "SET_FEATURE_FOCUS":
      return [saveStorage("activeModule", action.payload.pluginId)];
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
