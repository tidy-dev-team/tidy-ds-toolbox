import { useState, useEffect } from "react";
import { Card } from "@shell/components";
import { postToFigma } from "@shared/bridge";
import type { AnalyzedNode } from "./types";

type UIState =
  | { kind: "no-selection" }
  | { kind: "loading" }
  | { kind: "results"; nodes: AnalyzedNode[] };

export function IconFinderUI() {
  const [state, setState] = useState<UIState>({ kind: "no-selection" });

  useEffect(() => {
    postToFigma({
      target: "iconfinder",
      action: "start",
      payload: {},
    });

    return () => {
      postToFigma({
        target: "iconfinder",
        action: "stop",
        payload: {},
      });
    };
  }, []);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const message = event.data.pluginMessage || event.data;

      switch (message.type) {
        case "loading":
          setState({ kind: "loading" });
          break;
        case "no-selection":
          setState({ kind: "no-selection" });
          break;
        case "analyze-png": {
          const nodes = message.payload?.nodes as AnalyzedNode[] | undefined;
          if (nodes && nodes.length > 0) {
            setState({ kind: "results", nodes });
          } else {
            setState({ kind: "no-selection" });
          }
          break;
        }
        default:
          break;
      }
    };

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, []);

  const renderContent = () => {
    switch (state.kind) {
      case "loading":
        return (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flex: 1,
              color: "var(--disabled-color)",
            }}
          >
            Analyzing selection…
          </div>
        );
      case "no-selection":
        return (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flex: 1,
              flexDirection: "column",
              gap: "var(--pixel-12, 12px)",
              color: "var(--disabled-color)",
              textAlign: "center",
            }}
          >
            <div style={{ fontSize: "32px", opacity: 0.3 }}>🔎</div>
            <div style={{ fontSize: "14px", fontWeight: 500 }}>
              Select an icon
            </div>
            <div style={{ fontSize: "12px", maxWidth: "250px" }}>
              Choose one or more nodes on the canvas to identify them.
            </div>
          </div>
        );
      case "results": {
        const totalSize = state.nodes.reduce(
          (sum, node) => sum + Math.ceil((node.png.length * 3) / 4),
          0,
        );
        const sizeKb = (totalSize / 1024).toFixed(1);
        return (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "var(--pixel-12, 12px)",
            }}
          >
            <div style={{ fontSize: "13px", fontWeight: 500 }}>
              {state.nodes.length} node{state.nodes.length === 1 ? "" : "s"}, ~
              {sizeKb} KB total
            </div>
            <ul
              style={{
                listStyle: "none",
                margin: 0,
                padding: 0,
                display: "flex",
                flexDirection: "column",
                gap: "var(--pixel-8, 8px)",
              }}
            >
              {state.nodes.map((node) => (
                <li
                  key={node.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "var(--pixel-8, 8px)",
                    fontSize: "12px",
                  }}
                >
                  <img
                    src={`data:image/png;base64,${node.png}`}
                    alt={node.name}
                    style={{
                      width: 32,
                      height: 32,
                      objectFit: "contain",
                      border: "1px solid var(--border-light)",
                      borderRadius: "var(--pixel-4, 4px)",
                    }}
                  />
                  <div style={{ minWidth: 0 }}>
                    <div
                      style={{
                        fontWeight: 500,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {node.name}
                    </div>
                    <div style={{ color: "var(--disabled-color)" }}>
                      {node.type}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        );
      }
    }
  };

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        gap: "var(--pixel-16, 16px)",
        padding: "var(--pixel-16, 16px)",
      }}
    >
      <Card title="Icon Finder">{renderContent()}</Card>
    </div>
  );
}
