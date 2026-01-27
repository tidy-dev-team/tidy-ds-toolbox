import { useCallback, useEffect, useRef, useState } from "react";
import { Card } from "@shell/components";
import { postToFigma } from "@shared/bridge";
import { OffBoardingAction, PageInfo } from "./types";
import {
  IconPackage,
  IconPackageExport,
  IconVariable,
} from "@tabler/icons-react";

interface PendingRequest {
  onSuccess?: (result: any) => void;
  onError?: (error: string) => void;
  onFinally?: () => void;
}

interface PageSelection extends PageInfo {
  selected: boolean;
}

export function OffBoardingUI() {
  const [isLoading, setIsLoading] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [pages, setPages] = useState<PageSelection[]>([]);

  const pendingRequests = useRef(new Map<string, PendingRequest>());

  const sendRequest = useCallback(
    (
      action: OffBoardingAction,
      payload: any,
      handlers: PendingRequest = {},
    ) => {
      const requestId = `off-boarding-${action}-${Date.now()}`;
      pendingRequests.current.set(requestId, handlers);
      postToFigma({
        target: "off-boarding",
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
      if (!message?.requestId) return;
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

  // Fetch pages on mount
  useEffect(() => {
    refreshPages();
  }, []);

  const refreshPages = useCallback(() => {
    sendRequest(
      "get-pages",
      {},
      {
        onSuccess: (result) => {
          if (result?.pages) {
            setPages(
              result.pages.map((p: PageInfo) => ({
                ...p,
                selected: true,
              })),
            );
          }
        },
      },
    );
  }, [sendRequest]);

  const handleSelectAll = useCallback(() => {
    setPages((prev) => prev.map((p) => ({ ...p, selected: true })));
  }, []);

  const handleDeselectAll = useCallback(() => {
    setPages((prev) => prev.map((p) => ({ ...p, selected: false })));
  }, []);

  const handleTogglePage = useCallback((id: string) => {
    setPages((prev) =>
      prev.map((p) => (p.id === id ? { ...p, selected: !p.selected } : p)),
    );
  }, []);

  const allSelected = pages.length > 0 && pages.every((p) => p.selected);
  const noneSelected = pages.every((p) => !p.selected);
  const selectedCount = pages.filter((p) => p.selected).length;

  const handlePackPages = useCallback(() => {
    const selectedIds = pages.filter((p) => p.selected).map((p) => p.id);
    if (selectedIds.length === 0) return;

    setIsLoading("pack");
    setStatusMessage(null);
    setErrorMessage(null);

    sendRequest(
      "pack-pages",
      { pageIds: selectedIds },
      {
        onSuccess: (result) => {
          if (result?.success) {
            setStatusMessage(result.message);
            refreshPages();
          } else {
            setErrorMessage(result?.message ?? "Failed to pack pages");
          }
        },
        onError: (error) => setErrorMessage(error),
        onFinally: () => setIsLoading(null),
      },
    );
  }, [pages, sendRequest, refreshPages]);

  const handleUnpackPages = useCallback(() => {
    setIsLoading("unpack");
    setStatusMessage(null);
    setErrorMessage(null);

    sendRequest(
      "unpack-pages",
      {},
      {
        onSuccess: (result) => {
          if (result?.success) {
            setStatusMessage(result.message);
            refreshPages();
          } else {
            setErrorMessage(result?.message ?? "Failed to unpack pages");
          }
        },
        onError: (error) => setErrorMessage(error),
        onFinally: () => setIsLoading(null),
      },
    );
  }, [sendRequest, refreshPages]);

  const handleFindBoundVariables = useCallback(() => {
    setIsLoading("find");
    setStatusMessage(null);
    setErrorMessage(null);

    sendRequest(
      "find-bound-variables",
      {},
      {
        onSuccess: (result) => {
          if (result?.success) {
            setStatusMessage(result.message);
          } else {
            setErrorMessage(
              result?.message ?? "Failed to find bound variables",
            );
          }
        },
        onError: (error) => setErrorMessage(error),
        onFinally: () => setIsLoading(null),
      },
    );
  }, [sendRequest]);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "var(--pixel-16, 16px)",
        padding: "var(--pixel-16, 16px)",
      }}
    >
      <Card title="Pack Pages">
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          ></div>

          <div
            style={{
              maxHeight: "150px",
              overflowY: "auto",
              border: "1px solid var(--border-light)",
              borderRadius: "4px",
              marginBottom: "12px",
            }}
          >
            <div
              style={{
                padding: "8px",
                position: "sticky",
                top: "0",
                borderBottom: "1px solid var(--border-light)",
                backgroundColor: "#ffffff",
              }}
            >
              {/* Select all - shown when none selected */}
              {noneSelected && (
                <label
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                    cursor: "pointer",
                    fontSize: "12px",
                    color: "var(--figma-color-text-brand)",
                  }}
                  onClick={handleSelectAll}
                >
                  <input type="checkbox" checked={false} readOnly />
                  <span>Select all</span>
                </label>
              )}
              {/* Select none with mixed state - shown when partial selection */}
              {!allSelected && !noneSelected && (
                <label
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                    cursor: "pointer",
                    fontSize: "12px",
                    color: "var(--figma-color-text-brand)",
                  }}
                  onClick={handleDeselectAll}
                >
                  <input
                    type="checkbox"
                    ref={(el) => {
                      if (el) el.indeterminate = true;
                    }}
                    readOnly
                  />
                  <span>Select none</span>
                </label>
              )}
              {/* Select none with checked state - shown when all selected */}
              {allSelected && (
                <label
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                    cursor: "pointer",
                    fontSize: "12px",
                    color: "var(--figma-color-text-brand)",
                  }}
                  onClick={handleDeselectAll}
                >
                  <input type="checkbox" checked={true} readOnly />
                  <span>Select none</span>
                </label>
              )}
            </div>
            {pages.map((page) => (
              <label
                key={page.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  padding: "4px 8px",
                  cursor: "pointer",
                }}
              >
                <input
                  type="checkbox"
                  checked={page.selected}
                  onChange={() => handleTogglePage(page.id)}
                />
                <span style={{ fontSize: "12px" }}>{page.name}</span>
              </label>
            ))}
            {pages.length === 0 && (
              <div
                style={{
                  padding: "8px",
                  textAlign: "center",
                  fontSize: "12px",
                  color: "var(--figma-color-text-secondary)",
                }}
              >
                No pages found
              </div>
            )}
          </div>

          <button
            onClick={handlePackPages}
            disabled={noneSelected || isLoading !== null}
            className="primary-btn"
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "8px",
              opacity: noneSelected || isLoading ? 0.5 : 1,
            }}
          >
            <IconPackage size={16} stroke={1.5} />
            {isLoading === "pack"
              ? "Packing..."
              : `Pack ${selectedCount > 0 ? `${selectedCount} ` : ""}Page${selectedCount !== 1 ? "s" : ""}`}
          </button>
        </div>
      </Card>

      <Card title="Utilities">
        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          <button
            onClick={handleFindBoundVariables}
            disabled={isLoading !== null}
            className="secondary-btn"
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "8px",
              opacity: isLoading ? 0.5 : 1,
            }}
          >
            <IconVariable size={16} stroke={1.5} />
            {isLoading === "find" ? "Scanning..." : "Find Bound Variables"}
          </button>
        </div>
      </Card>

      <Card title="Unpack Pages">
        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          <p
            style={{
              fontSize: "11px",
              color: "var(--figma-color-text-secondary)",
              margin: 0,
            }}
          >
            Paste packed frames, then click Unpack to restore them as separate
            pages.
          </p>
          <button
            onClick={handleUnpackPages}
            disabled={isLoading !== null}
            className="secondary-btn"
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "8px",
              opacity: isLoading ? 0.5 : 1,
            }}
          >
            <IconPackageExport size={16} stroke={1.5} />
            {isLoading === "unpack" ? "Unpacking..." : "Unpack Pages"}
          </button>
        </div>
      </Card>

      {(statusMessage || errorMessage) && (
        <div
          style={{
            padding: "var(--pixel-12, 12px)",
            borderRadius: "var(--pixel-8, 8px)",
            fontSize: "12px",
            backgroundColor: statusMessage
              ? "rgba(5, 150, 105, 0.1)"
              : "rgba(220, 38, 38, 0.1)",
            color: statusMessage ? "#059669" : "#dc2626",
          }}
        >
          {statusMessage || errorMessage}
        </div>
      )}
    </div>
  );
}
