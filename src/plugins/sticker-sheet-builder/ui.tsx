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
  StickerSheetConfig,
  BuildProgress,
  GroupingMode,
  PageMarker,
} from "./types";

interface PageSelection extends PageMarker {
  selected: boolean;
}

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

  // Track last clicked index for shift+click range selection
  const lastClickedIndexRef = useRef<number | null>(null);

  // Build page selection state from context
  const selectedSet = new Set(context.config.selectedPageIds);
  const pageSelections: PageSelection[] = context.availablePages.map(
    (page) => ({
      ...page,
      selected: selectedSet.has(page.id),
    }),
  );

  const selectedCount = context.config.selectedPageIds.length;
  const allSelected =
    selectedCount === context.availablePages.length && selectedCount > 0;
  const noneSelected = selectedCount === 0;

  const handleConfigChange = useCallback(
    (updates: Partial<StickerSheetConfig>) => {
      const newConfig: StickerSheetConfig = {
        ...context.config,
        ...updates,
      };
      sendRequest("update-config", newConfig, {
        onSuccess: (result) => {
          if (result?.context) {
            setContext(result.context as StickerSheetBuilderContext);
          }
        },
        onError: (error) => setErrorMessage(error),
      });
    },
    [context.config, sendRequest],
  );

  const handlePageToggle = useCallback(
    (pageIndex: number, event: React.MouseEvent) => {
      const page = context.availablePages[pageIndex];
      if (!page) return;

      const currentSelected = new Set(context.config.selectedPageIds);
      const isCurrentlySelected = currentSelected.has(page.id);
      const targetState = !isCurrentlySelected;

      // Handle shift+click for range selection
      if (event.shiftKey && lastClickedIndexRef.current !== null) {
        const startIdx = Math.min(lastClickedIndexRef.current, pageIndex);
        const endIdx = Math.max(lastClickedIndexRef.current, pageIndex);

        // Toggle all pages in range to the target state
        for (let i = startIdx; i <= endIdx; i++) {
          const p = context.availablePages[i];
          if (p) {
            if (targetState) {
              currentSelected.add(p.id);
            } else {
              currentSelected.delete(p.id);
            }
          }
        }
      } else {
        // Normal click - toggle single page
        if (targetState) {
          currentSelected.add(page.id);
        } else {
          currentSelected.delete(page.id);
        }
      }

      lastClickedIndexRef.current = pageIndex;
      handleConfigChange({ selectedPageIds: Array.from(currentSelected) });
    },
    [
      context.availablePages,
      context.config.selectedPageIds,
      handleConfigChange,
    ],
  );

  const handleSelectAll = useCallback(() => {
    const allIds = context.availablePages.map((p) => p.id);
    handleConfigChange({ selectedPageIds: allIds });
  }, [context.availablePages, handleConfigChange]);

  const handleSelectNone = useCallback(() => {
    handleConfigChange({ selectedPageIds: [] });
  }, [handleConfigChange]);

  const handleDescriptionToggle = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      handleConfigChange({ requireDescription: e.target.checked });
    },
    [handleConfigChange],
  );

  const handleGroupingChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      handleConfigChange({ groupingMode: e.target.value as GroupingMode });
    },
    [handleConfigChange],
  );

  const isConfigValid = context.config.selectedPageIds.length > 0;

  const buildAllLabel = context.stickerSheetExists
    ? "↻ Rebuild sticker sheet"
    : "Build sticker sheet";

  return (
    <div
      style={containerStyle}
      className={context.selectionValid ? "selection-ready" : "selection-empty"}
    >
      <Card title="Configuration">
        <div style={configGridStyle}>
          <div style={configRowStyle}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <span style={labelStyle}>
                Component pages ({selectedCount} selected)
              </span>
              <span
                style={{
                  fontSize: "10px",
                  color: "var(--figma-color-text-tertiary, #999)",
                }}
              >
                Shift+click for range
              </span>
            </div>
            <div style={pageListContainerStyle}>
              {/* Select all / none row */}
              <div
                style={{
                  padding: "4px 8px",
                  borderBottom: "1px solid var(--figma-color-border, #e5e5e5)",
                }}
              >
                {noneSelected && (
                  <label
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                      cursor:
                        isLoading || isBuilding ? "not-allowed" : "pointer",
                      fontSize: "12px",
                      color: "var(--figma-color-text-brand)",
                    }}
                    onClick={
                      isLoading || isBuilding ? undefined : handleSelectAll
                    }
                  >
                    <input
                      type="checkbox"
                      checked={false}
                      readOnly
                      disabled={isLoading || isBuilding}
                    />
                    <span>Select all</span>
                  </label>
                )}
                {!allSelected && !noneSelected && (
                  <label
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                      cursor:
                        isLoading || isBuilding ? "not-allowed" : "pointer",
                      fontSize: "12px",
                      color: "var(--figma-color-text-brand)",
                    }}
                    onClick={
                      isLoading || isBuilding ? undefined : handleSelectNone
                    }
                  >
                    <input
                      type="checkbox"
                      ref={(el) => {
                        if (el) el.indeterminate = true;
                      }}
                      readOnly
                      disabled={isLoading || isBuilding}
                    />
                    <span>Select none</span>
                  </label>
                )}
                {allSelected && (
                  <label
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                      cursor:
                        isLoading || isBuilding ? "not-allowed" : "pointer",
                      fontSize: "12px",
                      color: "var(--figma-color-text-brand)",
                    }}
                    onClick={
                      isLoading || isBuilding ? undefined : handleSelectNone
                    }
                  >
                    <input
                      type="checkbox"
                      checked={true}
                      readOnly
                      disabled={isLoading || isBuilding}
                    />
                    <span>Select none</span>
                  </label>
                )}
              </div>
              {/* Page rows */}
              {pageSelections.map((page, index) => (
                <label
                  key={page.id}
                  style={{
                    ...pageRowStyle,
                    backgroundColor: page.selected
                      ? "var(--figma-color-bg-selected, rgba(24, 160, 251, 0.1))"
                      : "transparent",
                    cursor: isLoading || isBuilding ? "not-allowed" : "pointer",
                  }}
                  onClick={(e) => {
                    e.preventDefault();
                    if (!isLoading && !isBuilding) {
                      handlePageToggle(index, e);
                    }
                  }}
                >
                  <input
                    type="checkbox"
                    checked={page.selected}
                    onChange={() => {}}
                    disabled={isLoading || isBuilding}
                    style={{
                      cursor:
                        isLoading || isBuilding ? "not-allowed" : "pointer",
                    }}
                  />
                  <span
                    style={{
                      flex: 1,
                      fontSize: "12px",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {page.name}
                  </span>
                </label>
              ))}
              {pageSelections.length === 0 && (
                <div
                  style={{
                    padding: "12px",
                    textAlign: "center",
                    fontSize: "12px",
                    color: "var(--figma-color-text-secondary)",
                  }}
                >
                  No pages found
                </div>
              )}
            </div>
          </div>
          <div style={checkboxRowStyle}>
            <input
              type="checkbox"
              id="require-description"
              checked={context.config.requireDescription}
              onChange={handleDescriptionToggle}
              disabled={isLoading || isBuilding}
            />
            <label htmlFor="require-description" style={checkboxLabelStyle}>
              Require ℹ️ in description
            </label>
          </div>
          <div style={configRowStyle}>
            <label style={labelStyle} htmlFor="grouping-mode">
              Grouping
            </label>
            <select
              id="grouping-mode"
              style={selectStyle}
              value={context.config.groupingMode ?? "section"}
              onChange={handleGroupingChange}
              disabled={isLoading || isBuilding}
            >
              <option value="section">By section (Kido DS only)</option>
              <option value="page">By source page</option>
            </select>
          </div>
          {!isConfigValid && (
            <div style={configHintStyle}>
              Select component pages to include in the sticker sheet.
            </div>
          )}
        </div>
      </Card>

      <Card title="Context">
        <div style={statusGridStyle}>
          <StatusRow
            label="Configuration"
            value={isConfigValid ? "Ready" : "Not configured"}
            tone={isConfigValid ? "success" : "warning"}
          />
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
            disabled={isLoading || isBuilding || !isConfigValid}
            className={isBuilding ? "morePadding working" : "morePadding"}
            style={getButtonStyle(!(isLoading || isBuilding) && isConfigValid)}
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

const configGridStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "var(--pixel-12, 12px)",
};

const configRowStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "var(--pixel-4, 4px)",
};

const labelStyle: React.CSSProperties = {
  fontSize: "12px",
  fontWeight: 500,
  color: "var(--figma-color-text-secondary, #6b7280)",
};

const selectStyle: React.CSSProperties = {
  padding: "var(--pixel-8, 8px)",
  borderRadius: "var(--pixel-4, 4px)",
  border: "1px solid var(--figma-color-border, #e5e5e5)",
  backgroundColor: "var(--figma-color-bg, #fff)",
  fontSize: "12px",
  cursor: "pointer",
};

const checkboxRowStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "var(--pixel-8, 8px)",
};

const checkboxLabelStyle: React.CSSProperties = {
  fontSize: "12px",
  color: "var(--figma-color-text, #333)",
  cursor: "pointer",
};

const configHintStyle: React.CSSProperties = {
  fontSize: "11px",
  color: "var(--figma-color-text-tertiary, #999)",
  fontStyle: "italic",
};

const pageListContainerStyle: React.CSSProperties = {
  maxHeight: "180px",
  overflowY: "auto",
  border: "1px solid var(--figma-color-border, #e5e5e5)",
  borderRadius: "4px",
};

const pageRowStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "8px",
  padding: "6px 8px",
  borderBottom: "1px solid var(--figma-color-border, #e5e5e5)",
  transition: "background-color 0.1s ease",
};

function getButtonStyle(enabled: boolean): React.CSSProperties {
  return {
    backgroundColor: enabled ? "" : "var(--disabled-color)",
  };
}
