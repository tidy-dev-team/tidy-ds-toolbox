import { useState, useEffect, useRef, useCallback } from "react";
import { IconSearch, IconExternalLink } from "@tabler/icons-react";
import { Card } from "@shell/components";
import { postToFigma, openExternalLink } from "@shared/bridge";
import { hashPngBase64 } from "./hash/runtime";
import { findTopN, type MatchResult } from "./hash/query";
import { getIconDatabase } from "./db/load";
import { docUrlFor } from "./db/links";
import type { AnalyzedNode } from "./types";

interface NodeResult {
  node: AnalyzedNode;
  matches: MatchResult[];
}

type UIState =
  | { kind: "no-selection" }
  | { kind: "loading" }
  | { kind: "error" }
  | { kind: "results"; results: NodeResult[] };

// Number of matches to retrieve: 1 best + up to 6 runners-up.
const TOP_N = 7;

export function IconFinderUI() {
  const [state, setState] = useState<UIState>({ kind: "no-selection" });

  // Per-node hash cache so re-selecting a previously analyzed node doesn't
  // recompute its hash. Keyed by node id; invalidated when the node's exported
  // PNG changes (i.e. the node was edited).
  const hashCache = useRef<Map<string, { png: string; hash: bigint }>>(
    new Map(),
  );
  // Monotonic token: rapid selection changes fire async hashes that can resolve
  // out of order, so we drop any result from a superseded generation.
  const generation = useRef(0);

  const analyze = useCallback(async (nodes: AnalyzedNode[]) => {
    const gen = ++generation.current;
    try {
      const database = getIconDatabase();
      const results: NodeResult[] = [];

      for (const node of nodes) {
        let hash: bigint;
        const cached = hashCache.current.get(node.id);
        if (cached && cached.png === node.png) {
          hash = cached.hash;
        } else {
          hash = await hashPngBase64(node.png);
          if (gen !== generation.current) return; // superseded — drop stale work
          hashCache.current.set(node.id, { png: node.png, hash });
        }
        results.push({ node, matches: findTopN(hash, database, TOP_N) });
      }

      if (gen !== generation.current) return;
      setState({ kind: "results", results });
    } catch (err) {
      // A decode/canvas failure must not wedge the UI in "loading" forever.
      if (gen !== generation.current) return;
      console.error("[iconfinder] analysis failed", err);
      setState({ kind: "error" });
    }
  }, []);

  useEffect(() => {
    postToFigma({ target: "iconfinder", action: "start", payload: {} });
    return () => {
      postToFigma({ target: "iconfinder", action: "stop", payload: {} });
    };
  }, []);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const message = event.data.pluginMessage || event.data;
      switch (message?.type) {
        case "loading":
          generation.current++; // invalidate any in-flight analysis
          setState({ kind: "loading" });
          break;
        case "no-selection":
          generation.current++;
          setState({ kind: "no-selection" });
          break;
        case "analyze-png": {
          const nodes = message.payload?.nodes as AnalyzedNode[] | undefined;
          if (nodes && nodes.length > 0) {
            void analyze(nodes);
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
  }, [analyze]);

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
      {/* Force stored glyph SVGs (width/height stripped at build time) to fill
          their box and inherit the surrounding text color via currentColor. */}
      <style>{`.if-glyph svg { width: 100%; height: 100%; display: block; }`}</style>

      {state.kind === "loading" && <LoadingState />}
      {state.kind === "no-selection" && <NoSelectionState />}
      {state.kind === "error" && <ErrorState />}
      {state.kind === "results" &&
        state.results.map((result) => (
          <ResultCard key={result.node.id} result={result} />
        ))}
    </div>
  );
}

function ResultCard({ result }: { result: NodeResult }) {
  const { node, matches } = result;
  const best = matches[0];
  const runnersUp = matches.slice(1);

  return (
    <Card title={node.name}>
      {best ? (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "var(--pixel-16, 16px)",
          }}
        >
          <BestMatch png={node.png} match={best} />
          {runnersUp.length > 0 && <RunnersUp matches={runnersUp} />}
        </div>
      ) : (
        <NoMatch png={node.png} />
      )}
    </Card>
  );
}

function BestMatch({ png, match }: { png: string; match: MatchResult }) {
  const { entry, confidence } = match;
  const docUrl = docUrlFor(entry.source, entry.name);

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "var(--pixel-16, 16px)",
      }}
    >
      <SelectedPreview png={png} />
      <div style={{ fontSize: "20px", color: "var(--disabled-color)" }}>→</div>
      <Glyph svg={entry.svg} size={48} />
      <div style={{ minWidth: 0, flex: 1 }}>
        <div
          style={{
            fontWeight: 600,
            fontSize: "14px",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {entry.name}
        </div>
        <div
          style={{
            fontSize: "12px",
            color: "var(--disabled-color)",
            marginBottom: "var(--pixel-6, 6px)",
          }}
        >
          {entry.source}
        </div>
        <ConfidenceBar confidence={confidence} />
        {docUrl && (
          <button
            type="button"
            onClick={() => openExternalLink(docUrl)}
            style={{
              marginTop: "var(--pixel-8, 8px)",
              display: "inline-flex",
              alignItems: "center",
              gap: "var(--pixel-4, 4px)",
              padding: "0",
              border: "none",
              background: "none",
              color: "var(--primary-color)",
              fontSize: "12px",
              cursor: "pointer",
            }}
          >
            Open docs <IconExternalLink size={13} />
          </button>
        )}
      </div>
    </div>
  );
}

function RunnersUp({ matches }: { matches: MatchResult[] }) {
  return (
    <div>
      <div
        style={{
          fontSize: "11px",
          textTransform: "uppercase",
          letterSpacing: "0.04em",
          color: "var(--disabled-color)",
          marginBottom: "var(--pixel-8, 8px)",
        }}
      >
        Other matches
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(64px, 1fr))",
          gap: "var(--pixel-8, 8px)",
        }}
      >
        {matches.map((m) => {
          const docUrl = docUrlFor(m.entry.source, m.entry.name);
          return (
            <button
              key={`${m.entry.source}-${m.entry.name}`}
              type="button"
              title={`${m.entry.name} · ${m.entry.source} · ${Math.round(
                m.confidence * 100,
              )}%`}
              onClick={() => docUrl && openExternalLink(docUrl)}
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: "var(--pixel-4, 4px)",
                padding: "var(--pixel-8, 8px)",
                border: "1px solid var(--border-light)",
                borderRadius: "var(--pixel-6, 6px)",
                background: "var(--panel-color)",
                cursor: docUrl ? "pointer" : "default",
              }}
            >
              <Glyph svg={m.entry.svg} size={24} />
              <span
                style={{
                  fontSize: "10px",
                  color: "var(--disabled-color)",
                  maxWidth: "100%",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {m.entry.name}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function NoMatch({ png }: { png: string }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "var(--pixel-12, 12px)",
      }}
    >
      <SelectedPreview png={png} />
      <div style={{ fontSize: "13px", color: "var(--disabled-color)" }}>
        No confident match found in the icon database.
      </div>
    </div>
  );
}

function SelectedPreview({ png }: { png: string }) {
  return (
    <img
      src={`data:image/png;base64,${png}`}
      alt="Selected node"
      style={{
        width: 48,
        height: 48,
        objectFit: "contain",
        border: "1px solid var(--border-light)",
        borderRadius: "var(--pixel-6, 6px)",
        background: "#ffffff",
        flexShrink: 0,
      }}
    />
  );
}

function Glyph({ svg, size }: { svg?: string; size: number }) {
  if (!svg) {
    return (
      <div
        style={{
          width: size,
          height: size,
          flexShrink: 0,
          color: "var(--disabled-color)",
        }}
      />
    );
  }
  return (
    <span
      className="if-glyph"
      style={{
        width: size,
        height: size,
        flexShrink: 0,
        color: "currentColor",
      }}
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}

function ConfidenceBar({ confidence }: { confidence: number }) {
  const pct = Math.round(confidence * 100);
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "var(--pixel-8, 8px)",
      }}
    >
      <div
        style={{
          flex: 1,
          height: 4,
          borderRadius: 2,
          background: "var(--border-light)",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            width: `${pct}%`,
            height: "100%",
            background: "var(--primary-color)",
          }}
        />
      </div>
      <span
        style={{
          fontSize: "11px",
          color: "var(--disabled-color)",
          minWidth: 32,
          textAlign: "right",
        }}
      >
        {pct}%
      </span>
    </div>
  );
}

function LoadingState() {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flex: 1,
        color: "var(--disabled-color)",
        fontSize: "13px",
      }}
    >
      Analyzing selection…
    </div>
  );
}

function ErrorState() {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flex: 1,
        textAlign: "center",
        padding: "var(--pixel-16, 16px)",
        color: "var(--disabled-color)",
        fontSize: "13px",
      }}
    >
      Couldn’t analyze the selection. Try selecting a different node.
    </div>
  );
}

function NoSelectionState() {
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
      <IconSearch size={32} opacity={0.4} />
      <div style={{ fontSize: "14px", fontWeight: 500 }}>Select an icon</div>
      <div style={{ fontSize: "12px", maxWidth: "250px" }}>
        Choose one or more nodes on the canvas to identify which library they
        came from.
      </div>
    </div>
  );
}
