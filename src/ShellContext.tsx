import React, {
  createContext,
  useContext,
  useReducer,
  useRef,
  useCallback,
  ReactNode,
  useEffect,
} from "react";
import { ShellMessage } from "@shared/types";
import { postToFigma } from "@shared/bridge";
import {
  initialState,
  shellEffects,
  shellReducer,
  type ShellAction,
  type ShellState,
} from "./shellState";

export type { ShellAction, ShellState };

const ShellContext = createContext<{
  state: ShellState;
  dispatch: React.Dispatch<ShellAction>;
} | null>(null);

export function ShellProvider({ children }: { children: ReactNode }) {
  const [state, baseDispatch] = useReducer(shellReducer, initialState);

  // The state `dispatch` reads when deciding what to send. A ref rather than
  // the `state` binding because the message-bus listener below is registered
  // once and would otherwise close over the state as it was at mount.
  const stateRef = useRef(state);
  stateRef.current = state;

  // The only place shell state reaches the main thread.
  //
  // `shellReducer` used to post from inside its own cases, which React is free
  // to run more than once per dispatch - and does, under the StrictMode wrapper
  // in `main.tsx`. Sending here instead makes the number of sends exactly the
  // number of dispatches, and leaves the reducer pure enough to test.
  //
  // Effects are computed from the pre-action state and sent before the reducer
  // runs, which is the order the old in-reducer sends had.
  const dispatch = useCallback((action: ShellAction) => {
    for (const message of shellEffects(stateRef.current, action)) {
      postToFigma(message);
    }
    baseDispatch(action);
  }, []);

  // Request stored active module + bridge mode on mount
  useEffect(() => {
    postToFigma({
      target: "shell",
      action: "load-storage",
      payload: { key: "activeModule" },
      requestId: "restore-module",
    });
    postToFigma({
      target: "shell",
      action: "load-storage",
      payload: { key: "lastNormalSize" },
      requestId: "restore-last-normal-size",
    });
    postToFigma({
      target: "shell",
      action: "load-storage",
      payload: { key: "bridgeMode" },
      requestId: "restore-bridge-mode",
    });
  }, []);

  // Message bus for handling messages from main thread
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const rawData: unknown = event.data;
      const message: ShellMessage | undefined =
        (rawData as { pluginMessage?: ShellMessage })?.pluginMessage ??
        (rawData as ShellMessage | undefined);
      if (message?.type) {
        switch (message.type) {
          case "resize":
            dispatch({ type: "SET_WINDOW_SIZE", payload: message.payload });
            break;
          case "theme-sync":
            dispatch({ type: "SET_THEME", payload: message.payload });
            break;
          case "settings-update":
            dispatch({ type: "UPDATE_SETTINGS", payload: message.payload });
            break;
          case "module-loaded":
            // Handle module loaded
            break;
          case "usage-event":
            // Analytics relay (#43) — consumed by the usage transport's own
            // window listener, not the shell. Ignore here to avoid noise.
            break;
          case "response":
            // Handle storage response
            if (message.requestId === "restore-module" && message.result) {
              dispatch({
                type: "RESTORE_ACTIVE_MODULE",
                payload: message.result,
              });
            } else if (
              message.requestId === "restore-last-normal-size" &&
              message.result &&
              typeof message.result === "object" &&
              "width" in message.result &&
              "height" in message.result
            ) {
              dispatch({
                type: "RESTORE_LAST_NORMAL_SIZE",
                payload: message.result,
              });
            } else if (
              message.requestId === "restore-bridge-mode" &&
              message.result === true
            ) {
              // Re-enter bridge: dispatch sends resize + persists state
              dispatch({ type: "ENTER_BRIDGE_MODE" });
            }
            break;
          case "error":
            console.error("Shell error:", message.payload);
            break;
          default:
            console.warn("Unknown shell message:", message);
        }
      }
    };

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [dispatch]);

  return (
    <ShellContext.Provider value={{ state, dispatch }}>
      {children}
    </ShellContext.Provider>
  );
}

export function useShell() {
  const context = useContext(ShellContext);
  if (!context) {
    throw new Error("useShell must be used within a ShellProvider");
  }
  return context;
}
