import React, { useCallback, useEffect, useRef, useState } from "react";
import { Card } from "@shell/components";
import { postToFigma } from "@shared/bridge";
import Loader from "./assets/loader.svg";
import {
  DEFAULT_STICKER_SHEET_CONTEXT,
  STICKER_SHEET_CONTEXT_EVENT,
  STICKER_SHEET_PROGRESS_EVENT,
  STICKER_SHEET_MODULE_ID,
  StickerSheetBuilderContext,
  BuildProgress,
} from "./types";

interface PendingRequest {
  onSuccess?: (result: any) => void;
  onError?: (error: string) => void;
  onFinally?: () => void;
}

export function StickerSheetBuilderUI() {
  const [context, setContext] = useState<StickerSheetBuilderContext>(
    DEFAULT_STICKER_SHEET_CONTEXT,
  );
  const [isLoading, setIsLoading] = useState(true);
  const [isBuilding, setIsBuilding] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [progress, setProgress] = useState<BuildProgress | null>(null);

  const pendingRequests = useRef(new Map<string, PendingRequest>());

  const sendRequest = useCallback(
    (action: string, payload: any = {}, handlers: PendingRequest = {}) => {
      const requestId = `${STICKER_SHEET_MODULE_ID}-${action}-${Date.now()}`;
      pendingRequests.current.set(requestId, handlers);
      postToFigma({
        target: STICKER_SHEET_MODULE_ID,
        action,
        payload,
        requestId,
      });
      return requestId;
    },
    [],
  );

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const message = event.data.pluginMessage || event.data;
      if (!message) return;

      if (message.type === STICKER_SHEET_CONTEXT_EVENT) {
        if (message.payload) {
          setContext(message.payload as StickerSheetBuilderContext);
          setIsLoading(false);
        }
        return;
      }

      if (message.type === STICKER_SHEET_PROGRESS_EVENT) {
        setProgress(message.payload as BuildProgress);
        return;
      }

      if (!message.requestId) return;
      const handlers = pendingRequests.current.get(message.requestId);
      if (!handlers) return;
      pendingRequests.current.delete(message.requestId);

      if (message.type === "error") {
        handlers.onError?.(message.error ?? "Unknown error");
      } else {
        handlers.onSuccess?.(message.result);
      }
      handlers.onFinally?.();
    };

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, []);

  useEffect(() => {
    sendRequest(
      "init",
      {},
      {
        onSuccess: (result) => {
          if (result?.context) {
            setContext(result.context as StickerSheetBuilderContext);
          }
        },
        onError: (error) => setErrorMessage(error),
        onFinally: () => setIsLoading(false),
      },
    );
  }, [sendRequest]);

  const handleBuildOne = useCallback(() => {
    if (isLoading || isBuilding) return;
    setIsBuilding(true);
    setStatusMessage(null);
    setErrorMessage(null);
    setProgress(null);

    sendRequest(
      "build-one",
      {},
      {
        onSuccess: (result) => {
          const builtCount = Number(result?.builtCount ?? 0);
          const label = builtCount === 1 ? "sticker" : "stickers";
          if (result?.cancelled) {
            setStatusMessage(`Cancelled after building ${builtCount} ${label}`);
          } else {
            setStatusMessage(`Built ${builtCount} ${label}`);
          }
        },
        onError: (error) => setErrorMessage(error),
        onFinally: () => {
          setIsBuilding(false);
          setProgress(null);
        },
      },
    );
  }, [isLoading, isBuilding, sendRequest]);

  const handleBuildAll = useCallback(() => {
    if (isLoading || isBuilding) return;
    setIsBuilding(true);
    setStatusMessage(null);
    setErrorMessage(null);
    setProgress(null);

    sendRequest(
      "build-all",
      {},
      {
        onSuccess: (result) => {
          const builtCount = Number(result?.builtCount ?? 0);
          const label = builtCount === 1 ? "component" : "components";
          if (result?.cancelled) {
            setStatusMessage(`Cancelled after building ${builtCount} ${label}`);
          } else {
            setStatusMessage(
              `Sticker sheet updated from ${builtCount} ${label}`,
            );
          }
        },
        onError: (error) => setErrorMessage(error),
        onFinally: () => {
          setIsBuilding(false);
          setProgress(null);
        },
      },
    );
  }, [isLoading, isBuilding, sendRequest]);

  const handleCancel = useCallback(() => {
    sendRequest("cancel-build");
  }, [sendRequest]);

  const buildAllLabel = context.stickerSheetExists
    ? "↻ Rebuild sticker sheet"
    : "Build sticker sheet";

  return (
    <div
      style={containerStyle}
      className={context.selectionValid ? "selection-ready" : "selection-empty"}
    >
      <Card title="Context">
        <div style={statusGridStyle}>
          <StatusRow
            label="Sticker sheet"
            value={context.stickerSheetExists ? "Detected" : "Not found"}
            tone={context.stickerSheetExists ? "success" : "muted"}
          />
          <StatusRow
            label="Selection"
            value={context.selectionValid ? "Ready" : "Nothing is selected"}
            tone={context.selectionValid ? "success" : "warning"}
          />
        </div>
      </Card>

      <Card title="Actions">
        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          <button
            onClick={handleBuildOne}
            className={
              isBuilding
                ? "morePadding secondary working"
                : "morePadding secondary"
            }
            disabled={isLoading || isBuilding || !context.selectionValid}
            style={getButtonStyle(
              context.selectionValid && !isBuilding && !isLoading,
            )}
          >
            {isBuilding ? "" : "Build one sticker"}
          </button>
          <button
            onClick={handleBuildAll}
            disabled={isLoading || isBuilding}
            className={isBuilding ? "morePadding working" : "morePadding"}
            style={getButtonStyle(!(isLoading || isBuilding))}
          >
            {isBuilding ? <img src={Loader} /> : buildAllLabel}
          </button>
          {isBuilding && (
            <button
              onClick={handleCancel}
              className="morePadding"
              style={cancelButtonStyle}
            >
              Cancel
            </button>
          )}
          {isBuilding && progress && (
            <div style={progressStyle}>
              Building "{progress.currentComponentName}" ({progress.current} of{" "}
              {progress.total})
            </div>
          )}
          {statusMessage && (
            <div style={{ ...messageStyle, color: "#059669" }}>
              {statusMessage}
            </div>
          )}
          {errorMessage && (
            <div style={{ ...messageStyle, color: "#dc2626" }}>
              {errorMessage}
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}

interface StatusRowProps {
  label: string;
  value: string;
  tone: "success" | "warning" | "muted";
}

function StatusRow({ label, value, tone }: StatusRowProps) {
  const toneColor =
    tone === "success" ? "#16a34a" : tone === "warning" ? "#d97706" : "#6b7280";
  const backgroundColor = `${toneColor}20`;

  return (
    <div style={statusRowStyle}>
      <span style={{ color: "#6b7280", fontSize: 12 }}>{label}</span>
      <span
        className={`selection-${tone}`}
        style={{
          padding: "var(--pixel-2, 2px) var(--pixel-8, 8px)",
          borderRadius: 999,
          fontSize: 12,
          fontWeight: 600,
          color: toneColor,
          backgroundColor,
        }}
      >
        {value}
      </span>
    </div>
  );
}

const containerStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "var(--pixel-12, 12px)",
  padding: "var(--pixel-16, 16px)",
};

const statusGridStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "var(--pixel-8, 8px)",
};

const statusRowStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
};

const messageStyle: React.CSSProperties = {
  fontSize: "12px",
  fontWeight: "500",
};

const progressStyle: React.CSSProperties = {
  fontSize: "12px",
  fontWeight: "500",
  color: "#6b7280",
  padding: "4px 0",
};

const cancelButtonStyle: React.CSSProperties = {
  backgroundColor: "var(--figma-color-bg-danger, #dc2626)",
  color: "white",
};

function getButtonStyle(enabled: boolean): React.CSSProperties {
  return {
    backgroundColor: enabled ? "" : "var(--disabled-color)",
  };
}
