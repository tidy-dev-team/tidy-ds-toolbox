import { useEffect, useState } from "react";
import { Card } from "@shell/components";
import { postToFigma } from "@shared/bridge";
import {
  getBridgeStatus,
  subscribeBridgeStatus,
} from "@shared/operations/ui-bridge-startup";
import type { BridgeStatus } from "@shared/operations/ui-bridge";
import type { GetContextResult, DocumentSelectionResult } from "./types";

const BRIDGE_STATUS_LABEL: Record<BridgeStatus, string> = {
  open: "connected",
  connecting: "connecting…",
  closed: "not connected",
};

export function TidyDocUI() {
  const [fileKey, setFileKey] = useState<string | null>(null);
  const [log, setLog] = useState<string[]>([]);
  const [building, setBuilding] = useState(false);
  const [bridgeStatus, setBridgeStatus] =
    useState<BridgeStatus>(getBridgeStatus());

  useEffect(() => {
    postToFigma({
      target: "tidy-doc",
      action: "get-context",
      payload: {},
      requestId: "get-context",
    });
  }, []);

  useEffect(() => subscribeBridgeStatus(setBridgeStatus), []);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const message = event.data.pluginMessage || event.data;
      if (!message) return;

      if (message.type === "response" && message.requestId === "get-context") {
        setFileKey((message.result as GetContextResult).fileKey);
      } else if (
        message.type === "response" &&
        message.requestId === "document-selection"
      ) {
        const result = message.result as DocumentSelectionResult;
        setLog((prev) => [
          ...prev,
          `Built Documentation Page for "${result.sourceComponentName}".`,
        ]);
        setBuilding(false);
      } else if (message.type === "error") {
        setLog((prev) => [...prev, `Error: ${message.error}`]);
        setBuilding(false);
      }
    };
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, []);

  const documentSelection = () => {
    setBuilding(true);
    postToFigma({
      target: "tidy-doc",
      action: "document-selection",
      payload: {},
      requestId: "document-selection",
    });
  };

  return (
    <div className="tidy-doc">
      <Card>
        <p className="status-message">
          Bridge: {BRIDGE_STATUS_LABEL[bridgeStatus]} · Session: bound
        </p>
        <p className="status-message">
          Bound file: <code>{fileKey ?? "unknown"}</code>
        </p>
        <p className="status-message">
          This module is primarily driven from Claude via the MCP bridge (
          <code>tidy_doc_read_component</code> /{" "}
          <code>tidy_doc_build_page</code>). The button below is a facts-only
          fallback with no authored prose.
        </p>
        <button disabled={building} onClick={documentSelection}>
          {building ? "Building…" : "Document selection"}
        </button>
      </Card>
      <Card>
        <p className="status-message">Build log</p>
        {log.length === 0 ? (
          <p className="status-message">No builds yet.</p>
        ) : (
          <ul>
            {log.map((line, i) => (
              <li key={i}>{line}</li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
