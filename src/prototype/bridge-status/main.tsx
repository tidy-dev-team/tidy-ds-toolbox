// THROWAWAY PROTOTYPE entry. Run with: npm run prototype:bridge
//
// Two axes, because one is useless without the other here: the variant
// (?variant=A|B|C, or left/right arrows) and the Bridge status
// (?status=open|connecting|closed, or up/down arrows). A status treatment can
// only be judged across all three states it has to represent.

import React, { useCallback, useEffect, useState } from "react";
import ReactDOM from "react-dom/client";
import "../../App.css";
import {
  VariantA,
  VariantB,
  VariantC,
  VARIANT_NAMES,
  LABEL,
  type BridgeStatus,
} from "./variants";

const VARIANTS = ["A", "B", "C"] as const;
const STATUSES: BridgeStatus[] = ["open", "connecting", "closed"];
type VariantKey = (typeof VARIANTS)[number];

function readParams(): { variant: VariantKey; status: BridgeStatus } {
  const p = new URLSearchParams(window.location.search);
  const v = (p.get("variant") ?? "A").toUpperCase() as VariantKey;
  const s = (p.get("status") ?? "open") as BridgeStatus;
  return {
    variant: VARIANTS.includes(v) ? v : "A",
    status: STATUSES.includes(s) ? s : "open",
  };
}

function Prototype() {
  const [{ variant, status }, setState] = useState(readParams);

  const go = useCallback((variant: VariantKey, status: BridgeStatus) => {
    const url = `${window.location.pathname}?variant=${variant}&status=${status}`;
    window.history.replaceState(null, "", url);
    setState({ variant, status });
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = document.activeElement;
      if (
        el instanceof HTMLInputElement ||
        el instanceof HTMLTextAreaElement ||
        (el as HTMLElement)?.isContentEditable
      ) {
        return;
      }
      const vi = VARIANTS.indexOf(variant);
      const si = STATUSES.indexOf(status);
      if (e.key === "ArrowRight")
        go(VARIANTS[(vi + 1) % VARIANTS.length], status);
      else if (e.key === "ArrowLeft")
        go(VARIANTS[(vi - 1 + VARIANTS.length) % VARIANTS.length], status);
      else if (e.key === "ArrowDown")
        go(variant, STATUSES[(si + 1) % STATUSES.length]);
      else if (e.key === "ArrowUp")
        go(variant, STATUSES[(si - 1 + STATUSES.length) % STATUSES.length]);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [variant, status, go]);

  const Current =
    variant === "A" ? VariantA : variant === "B" ? VariantB : VariantC;

  const btn: React.CSSProperties = {
    font: "inherit",
    background: "transparent",
    color: "inherit",
    border: "1px solid #ffffff40",
    borderRadius: 5,
    padding: "3px 9px",
    cursor: "pointer",
  };

  return (
    <>
      <Current status={status} />

      {/* Switcher. Deliberately not styled like the panel, so it is obviously
          not part of the design under evaluation. */}
      <div
        style={{
          position: "fixed",
          bottom: 16,
          left: "50%",
          transform: "translateX(-50%)",
          display: "flex",
          alignItems: "center",
          gap: 14,
          background: "#11161d",
          color: "#fff",
          padding: "9px 14px",
          borderRadius: 999,
          boxShadow: "0 6px 24px rgba(0,0,0,.35)",
          fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
          fontSize: 12,
          zIndex: 9999,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button
            style={btn}
            onClick={() =>
              go(
                VARIANTS[
                  (VARIANTS.indexOf(variant) - 1 + VARIANTS.length) %
                    VARIANTS.length
                ],
                status,
              )
            }
            aria-label="Previous variant"
          >
            ←
          </button>
          <span style={{ minWidth: 178 }}>
            {variant} — {VARIANT_NAMES[variant]}
          </span>
          <button
            style={btn}
            onClick={() =>
              go(
                VARIANTS[(VARIANTS.indexOf(variant) + 1) % VARIANTS.length],
                status,
              )
            }
            aria-label="Next variant"
          >
            →
          </button>
        </div>

        <span style={{ opacity: 0.3 }}>│</span>

        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          {STATUSES.map((s) => (
            <button
              key={s}
              style={{
                ...btn,
                borderColor: s === status ? "#fff" : "#ffffff40",
                opacity: s === status ? 1 : 0.55,
              }}
              onClick={() => go(variant, s)}
            >
              {s}
            </button>
          ))}
        </div>

        <span style={{ opacity: 0.45 }}>←→ variant · ↑↓ status</span>
      </div>

      {/* Full state, per rule 5. */}
      <div
        style={{
          position: "fixed",
          bottom: 62,
          left: "50%",
          transform: "translateX(-50%)",
          background: "#11161dE6",
          color: "#cbd5e1",
          padding: "5px 12px",
          borderRadius: 6,
          fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
          fontSize: 11,
          zIndex: 9999,
          whiteSpace: "nowrap",
        }}
      >
        {JSON.stringify({ variant, status, label: LABEL[status] })}
      </div>

      <style>{`
        @keyframes protoPulse { 0%,100%{opacity:1} 50%{opacity:.35} }
        html,body,#root{height:100%;margin:0}
      `}</style>
    </>
  );
}

const root = document.getElementById("root");
if (!root) throw new Error("no #root");
ReactDOM.createRoot(root).render(<Prototype />);
