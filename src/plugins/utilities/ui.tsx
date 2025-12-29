import { useCallback, useEffect, useRef, useState } from "react";
import { Card } from "@shell/components";
import { postToFigma } from "@shared/bridge";
import { UtilitiesAction } from "./types";
import { IconNote, IconFrame, IconLetterCase } from "@tabler/icons-react";

interface PendingRequest {
  onSuccess?: (result: any) => void;
  onError?: (error: string) => void;
  onFinally?: () => void;
}

interface UtilityConfig {
  id: UtilitiesAction;
  label: string;
  description: string;
  icon: React.ComponentType<{ size?: number; stroke?: number }>;
}

const UTILITIES: UtilityConfig[] = [
  {
    id: "address-note",
    label: "Address Note",
    description: "Add a navigation note above selected frames with a link back",
    icon: IconNote,
  },
  {
    id: "image-wrapper",
    label: "Image Wrapper",
    description: "Wrap selected items in individual frames",
    icon: IconFrame,
  },
  {
    id: "misprint",
    label: "Misprint",
    description: "Add scrambled Hebrew text to component descriptions",
    icon: IconLetterCase,
  },
];

export function UtilitiesUI() {
  const [isRunning, setIsRunning] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const pendingRequests = useRef(new Map<string, PendingRequest>());

  const sendRequest = useCallback(
    (action: string, payload: any, handlers: PendingRequest = {}) => {
      const requestId = `utilities-${action}-${Date.now()}`;
      pendingRequests.current.set(requestId, handlers);
      postToFigma({
        target: "utilities",
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

  const handleRunUtility = useCallback(
    (utilityId: UtilitiesAction) => {
      if (isRunning) return;

      setIsRunning(utilityId);
      setStatusMessage(null);
      setErrorMessage(null);

      sendRequest(
        utilityId,
        {},
        {
          onSuccess: (result) => {
            if (result?.success) {
              setStatusMessage(result.message);
            } else {
              setErrorMessage(result?.message ?? "Unknown error");
            }
          },
          onError: (error) => {
            setErrorMessage(error);
          },
          onFinally: () => setIsRunning(null),
        },
      );
    },
    [isRunning, sendRequest],
  );

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "var(--pixel-16, 16px)",
        padding: "var(--pixel-16, 16px)",
      }}
    >
      <Card title="Quick Actions">
        <div
          style={{
            display: "flex",
            gap: "var(--pixel-12, 12px)",
          }}
        >
          {UTILITIES.map((utility) => {
            const IconComponent = utility.icon;
            const isActive = isRunning === utility.id;

            return (
              <button
                key={utility.id}
                onClick={() => handleRunUtility(utility.id)}
                disabled={isRunning !== null}
                className="utility-btn"
                style={{
                  opacity: isRunning && !isActive ? 0.5 : 1,
                }}
              >
                <IconComponent size={40} stroke={1} />
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "var(--pixel-6, 6px)",
                  }}
                >
                  <div style={{ fontWeight: 500, fontSize: "13px" }}>
                    {isActive ? "Running..." : utility.label}
                  </div>
                  <div
                    style={{
                      fontSize: "11px",
                      opacity: 0.7,
                      marginTop: "2px",
                    }}
                  >
                    {utility.description}
                  </div>
                </div>
              </button>
            );
          })}
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
