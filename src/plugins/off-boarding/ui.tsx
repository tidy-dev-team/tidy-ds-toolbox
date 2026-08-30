import { useCallback, useEffect, useRef, useState } from "react";
import { Card } from "@shell/components";
import { postToFigma } from "@shared/bridge";
import { isStoppable } from "@shared/action-catalogue";
import { OffBoardingAction, PageInfo } from "./types";
import { PackPlan, UnpackPlan } from "./plan";
import {
  IconPackage,
  IconPackageExport,
  IconNut,
  IconLayoutGrid,
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
  // #155: the plan awaiting the designer's confirmation. Both actions can
  // destroy work and neither used to ask. The plan the dialog renders is the
  // same object the applier is handed, so the confirmation cannot describe work
  // that differs from the work performed.
  const [pendingPlan, setPendingPlan] = useState<PackPlan | UnpackPlan | null>(
    null,
  );
  const [planDescription, setPlanDescription] = useState<string>("");

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

  // Asking for a plan changes nothing in the file. The dialog it opens is the
  // only route to `pack-pages` / `unpack-pages`, which is what makes the
  // confirmation unskippable rather than advisory.
  const requestPlan = useCallback(
    (action: OffBoardingAction, payload: unknown, busy: string) => {
      setIsLoading(busy);
      setStatusMessage(null);
      setErrorMessage(null);
      setPendingPlan(null);

      sendRequest(action, payload, {
        onSuccess: (result) => {
          if (result?.success && result.plan) {
            setPendingPlan(result.plan);
            setPlanDescription(result.message);
          } else {
            setErrorMessage(result?.message ?? "Could not work out what to do");
          }
        },
        onError: (error) => setErrorMessage(error),
        onFinally: () => setIsLoading(null),
      });
    },
    [sendRequest],
  );

  const handlePackPages = useCallback(() => {
    const selectedIds = pages.filter((p) => p.selected).map((p) => p.id);
    if (selectedIds.length === 0) return;
    requestPlan("plan-pack", { pageIds: selectedIds }, "pack");
  }, [pages, requestPlan]);

  const handleCancelPlan = useCallback(() => setPendingPlan(null), []);

  const handleConfirmPlan = useCallback(() => {
    if (!pendingPlan) return;
    const plan = pendingPlan;
    const isPack = plan.kind === "pack";
    setPendingPlan(null);
    setIsLoading(isPack ? "pack" : "unpack");
    setStatusMessage(null);
    setErrorMessage(null);

    sendRequest(
      isPack ? "pack-pages" : "unpack-pages",
      { plan },
      {
        onSuccess: (result) => {
          if (result?.success) {
            const remaining = result.remainingPageNames as string[] | undefined;
            // The summary after, so a designer who wants to undo knows there is
            // something to undo, and can compare it with what was promised.
            setStatusMessage(
              remaining && remaining.length > 0
                ? `${result.message} Not packed: ${remaining.join(", ")}.`
                : result.message,
            );
            refreshPages();
          } else {
            setErrorMessage(result?.message ?? "The run did not finish");
          }
        },
        onError: (error) => setErrorMessage(error),
        onFinally: () => setIsLoading(null),
      },
    );
  }, [pendingPlan, sendRequest, refreshPages]);

  const handleStopPack = useCallback(() => {
    postToFigma({
      target: "off-boarding",
      action: "cancel-pack",
    });
  }, []);

  const handleUnpackPages = useCallback(() => {
    requestPlan("plan-unpack", {}, "unpack");
  }, [requestPlan]);

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

  const handleFindHiddenStyles = useCallback(() => {
    setIsLoading("find-styles");
    setStatusMessage(null);
    setErrorMessage(null);

    sendRequest(
      "find-hidden-styles",
      {},
      {
        onSuccess: (result) => {
          if (result?.success) {
            setStatusMessage(result.message);
          } else {
            setErrorMessage(result?.message ?? "Failed to find hidden styles");
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
      <Card title="Pack Pages" className="card relative-element">
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div
            style={{
              display: "flex",
              flexDirection: "row",
              gap: "8px",
              marginBottom: "4px",
            }}
          >
            <button
              onClick={handleFindBoundVariables}
              disabled={isLoading !== null}
              className="secondary win-button"
              tool-tip="Find bound variables"
            >
              <IconNut size={16} stroke={1.5} />
              {isLoading === "find" ? "" : ""}
            </button>
            <button
              onClick={handleFindHiddenStyles}
              disabled={isLoading !== null}
              className="secondary win-button"
              tool-tip="Find hidden layout grid styles"
            >
              <IconLayoutGrid size={16} stroke={1.5} />
              {isLoading === "find-styles" ? "" : ""}
            </button>
          </div>

          <div
            style={{
              maxHeight: "calc(100vh - 320px)",
              overflowY: "auto",
              border: "1px solid var(--border-light)",
              borderRadius: "4px",
              marginTop: "4px",
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

          {/*
            #155: the confirmation. It states the count and names the pages, so
            a run against the wrong source is obvious from the numbers alone
            without reading the canvas. Cancelling changes nothing, so trying
            either feature carries no risk.
          */}
          {pendingPlan && (
            <div
              style={{
                border: "1px solid var(--figma-color-border)",
                borderRadius: "6px",
                padding: "12px",
                display: "flex",
                flexDirection: "column",
                gap: "10px",
              }}
            >
              <div style={{ fontSize: "12px", lineHeight: 1.5 }}>
                {planDescription}
              </div>
              <div style={{ display: "flex", gap: "8px" }}>
                <button onClick={handleConfirmPlan} className="note">
                  {pendingPlan.kind === "pack" ? "Pack" : "Unpack"}
                </button>
                <button onClick={handleCancelPlan} className="secondary note">
                  Cancel
                </button>
              </div>
            </div>
          )}

          <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
            <button
              onClick={handlePackPages}
              disabled={noneSelected || isLoading !== null}
              className="note"
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

            {isLoading === "pack" && isStoppable("off-boarding:pack-pages") && (
              <button onClick={handleStopPack} className="secondary note">
                Stop
              </button>
            )}

            <button
              onClick={handleUnpackPages}
              disabled={isLoading !== null}
              className="secondary note"
              tool-tip="Paste packed frames, then click this button"
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "8px",
              }}
            >
              <IconPackageExport size={16} stroke={1.5} />
              {isLoading === "unpack" ? "Unpacking..." : "Unpack Pages"}
            </button>
          </div>
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
