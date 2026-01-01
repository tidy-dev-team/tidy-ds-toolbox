import React, {
  createContext,
  useContext,
  useReducer,
  ReactNode,
  useEffect,
} from "react";
import { PluginID, ShellMessage } from "@shared/types";
import { postToFigma } from "@shared/bridge";
import { RESIZE_DEFAULT } from "@shared/resize";

interface ShellState {
  activeModule: PluginID;
  featureFocus: string | null; // CSS selector for scrolling to a feature section
  windowSize: { width: number; height: number };
  theme: "light" | "dark";
  settings: Record<string, any>;
}

type ShellAction =
  | { type: "SET_ACTIVE_MODULE"; payload: PluginID }
  | { type: "RESTORE_ACTIVE_MODULE"; payload: PluginID }
  | {
      type: "SET_FEATURE_FOCUS";
      payload: { pluginId: PluginID; section: string | null };
    }
  | { type: "CLEAR_FEATURE_FOCUS" }
  | { type: "SET_WINDOW_SIZE"; payload: { width: number; height: number } }
  | { type: "SET_THEME"; payload: "light" | "dark" }
  | { type: "UPDATE_SETTINGS"; payload: Record<string, any> };

const initialState: ShellState = {
  activeModule: "ds-explorer",
  featureFocus: null,
  windowSize: { ...RESIZE_DEFAULT },
  theme: "light",
  settings: {},
};

function shellReducer(state: ShellState, action: ShellAction): ShellState {
  switch (action.type) {
    case "SET_ACTIVE_MODULE":
      // Save to storage when module changes
      postToFigma({
        target: "shell",
        action: "save-storage",
        payload: { key: "activeModule", value: action.payload },
      });
      return { ...state, activeModule: action.payload, featureFocus: null };
    case "RESTORE_ACTIVE_MODULE":
      // Restore from storage without re-saving
      return { ...state, activeModule: action.payload };
    case "SET_FEATURE_FOCUS":
      // Navigate to plugin and set section focus
      postToFigma({
        target: "shell",
        action: "save-storage",
        payload: { key: "activeModule", value: action.payload.pluginId },
      });
      return {
        ...state,
        activeModule: action.payload.pluginId,
        featureFocus: action.payload.section,
      };
    case "CLEAR_FEATURE_FOCUS":
      return { ...state, featureFocus: null };
    case "SET_WINDOW_SIZE":
      return { ...state, windowSize: action.payload };
    case "SET_THEME":
      return { ...state, theme: action.payload };
    case "UPDATE_SETTINGS":
      return { ...state, settings: { ...state.settings, ...action.payload } };
    default:
      return state;
  }
}

const ShellContext = createContext<{
  state: ShellState;
  dispatch: React.Dispatch<ShellAction>;
} | null>(null);

export function ShellProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(shellReducer, initialState);

  // Request stored active module on mount
  useEffect(() => {
    postToFigma({
      target: "shell",
      action: "load-storage",
      payload: { key: "activeModule" },
      requestId: "restore-module",
    });
  }, []);

  // Message bus for handling messages from main thread
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const rawData = event.data as any;
      const message: ShellMessage = rawData?.pluginMessage ?? rawData;
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
          case "response":
            // Handle storage response
            if (message.requestId === "restore-module" && message.result) {
              dispatch({
                type: "RESTORE_ACTIVE_MODULE",
                payload: message.result,
              });
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
  }, []);

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
