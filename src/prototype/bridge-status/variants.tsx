// THROWAWAY PROTOTYPE - not production code, no tests, no error handling.
//
// Question: if the Documentation Page button goes away (docs are always
// initiated from Claude), where does Bridge connection status live in the panel?
//
// Three variants, deliberately disagreeing about information hierarchy rather
// than about colour:
//   A  sidebar-local   - status is one more thing in the nav rail
//   B  header-global   - status is chrome, always visible, sidebar-independent
//   C  event-only      - nothing at all while healthy; the UI speaks only on loss
//
// All three assume the Tidy Doc tab is GONE, which is the premise being tested.
//
// Two things worth knowing before judging these, both true of the real code:
//  1. BridgeStatus is three states, not two: "connecting" | "open" | "closed".
//     Reconnect backoff runs 250ms -> 10s, so "connecting" is genuinely on
//     screen and a two-colour lamp cannot say it.
//  2. "Bridge mode" already means something else in this UI - the collapsed
//     240x56 window (`state.bridgeMode`), whose `.bridge-bar` already shows a
//     status dot and the text "Tidy DS Toolbox · MCP bridge". So a tab called
//     "Bridge mode" would collide with a live concept.

import { IconHelpCircle, IconPlugConnected } from "@tabler/icons-react";

export type BridgeStatus = "connecting" | "open" | "closed";

export const LABEL: Record<BridgeStatus, string> = {
  open: "Claude connected",
  connecting: "Connecting to Claude…",
  closed: "Claude not connected",
};

const TONE: Record<BridgeStatus, string> = {
  open: "#2E9E5B",
  connecting: "#C99A2E",
  closed: "#B4483A",
};

/** The nav rail, minus Tidy Doc. Hardcoded on purpose - throwaway. */
const MODULES = [
  "DS Explorer",
  "Component Labels",
  "Tidy Icon Care",
  "Tidy Mapper",
  "Utilities",
  "Audit",
  "Color Finder",
  "Icon Finder",
  "Off-Boarding",
  "Release Notes",
  "Sticker Sheet Builder",
];

function Dot({ status, size = 8 }: { status: BridgeStatus; size?: number }) {
  return (
    <span
      aria-hidden="true"
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        background: TONE[status],
        flex: "0 0 auto",
        boxShadow: status === "open" ? `0 0 0 3px ${TONE.open}22` : undefined,
        animation:
          status === "connecting"
            ? "protoPulse 1.1s ease-in-out infinite"
            : undefined,
      }}
    />
  );
}

function Rail({ small, footer }: { small: boolean; footer?: React.ReactNode }) {
  return (
    <aside className={`sidebar${small ? " small" : ""}`}>
      <nav>
        {MODULES.map((m, i) => (
          <button
            key={m}
            className={`nav-item${i === 0 ? " active" : ""}`}
            title={m}
          >
            <span className="icon">
              <IconPlugConnected size={16} stroke={1.5} />
            </span>
            <span className="label">{m}</span>
          </button>
        ))}
      </nav>
      <div className="spacer" />
      {footer}
      <button className="nav-item docs-link" title="Documentation">
        <span className="icon">
          <IconHelpCircle size={16} stroke={1.5} />
        </span>
        <span className="label">Documentation</span>
      </button>
    </aside>
  );
}

function Body({ note }: { note: string }) {
  return (
    <main className="viewport">
      <div style={{ padding: 20, maxWidth: 620 }}>
        <h2 style={{ margin: "0 0 8px", fontSize: 17 }}>DS Explorer</h2>
        <p style={{ margin: "0 0 18px", opacity: 0.7, fontSize: 13 }}>
          Stand-in for whichever module is open. The panel content is here only
          so the status treatment is judged against real density instead of
          against an empty page.
        </p>
        <div
          style={{
            border: "1px dashed currentColor",
            opacity: 0.35,
            borderRadius: 6,
            height: 190,
            display: "grid",
            placeItems: "center",
            fontSize: 12,
          }}
        >
          module content
        </div>
        <p style={{ marginTop: 18, fontSize: 12, opacity: 0.75 }}>
          <strong>This variant:</strong> {note}
        </p>
      </div>
    </main>
  );
}

function Header({ right }: { right?: React.ReactNode }) {
  return (
    <header className="header">
      <button className="menuBtn" aria-label="Toggle sidebar" />
      <h1>
        Tidy DS Toolbox
        <span className="version">v{__APP_VERSION__}</span>
      </h1>
      <div className="searchdiv">
        <input
          type="search"
          placeholder="Search features..."
          className="searchbar"
        />
      </div>
      {right}
    </header>
  );
}

/* ------------------------------------------------------------------ */

export const VARIANT_NAMES = {
  A: "Sidebar lamp",
  B: "Header pill",
  C: "Quiet until broken",
} as const;

/**
 * A - the lamp is a citizen of the nav rail, sitting where the Tidy Doc tab
 * used to be. Cheapest change, and it survives the collapsed rail by falling
 * back to the dot alone. Costs: it is only visible while the rail is, and it
 * reads as one more nav item, so it invites a click that does nothing.
 */
export function VariantA({ status }: { status: BridgeStatus }) {
  return (
    <div className="app">
      <Header />
      <div className="main">
        <Rail
          small={false}
          footer={
            <div
              className="nav-item"
              style={{ cursor: "default", gap: 10, opacity: 0.95 }}
              title={LABEL[status]}
            >
              <span
                className="icon"
                style={{ display: "grid", placeItems: "center" }}
              >
                <Dot status={status} />
              </span>
              <span className="label" style={{ fontSize: 12 }}>
                {LABEL[status]}
              </span>
            </div>
          }
        />
        <Body note="status lives in the nav rail, where the Tidy Doc tab was. Try the collapsed rail - it degrades to the dot." />
      </div>
    </div>
  );
}

/**
 * B - status is panel chrome, not module content: a pill in the header, right
 * of the search field, visible whatever the rail is doing and whatever module
 * is open. Expands on click to show the bound file, which is the other thing
 * the Tidy Doc tab was carrying. Costs: it spends permanent header room on
 * something that is boring 95% of the time.
 */
export function VariantB({ status }: { status: BridgeStatus }) {
  return (
    <div className="app">
      <Header
        right={
          <button
            type="button"
            title={`${LABEL[status]} · file 8fJq2… `}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 7,
              padding: "5px 10px",
              marginLeft: 10,
              borderRadius: 999,
              border: "1px solid currentColor",
              background: "transparent",
              font: "inherit",
              fontSize: 11.5,
              letterSpacing: ".01em",
              cursor: "pointer",
              whiteSpace: "nowrap",
              opacity: 0.9,
            }}
          >
            <Dot status={status} />
            {LABEL[status]}
          </button>
        }
      />
      <div className="main">
        <Rail small={false} />
        <Body note="status is header chrome. Independent of the rail and of which module is open, at the cost of permanent header space." />
      </div>
    </div>
  );
}

/**
 * C - the radical one: while the Bridge is open the panel says nothing at all.
 * A strip appears under the header only for `connecting` and `closed`, because
 * that is the only time the information changes what a designer should do.
 * Costs: no way to confirm a healthy connection, which is exactly what someone
 * debugging "is Claude even attached?" wants. Silence reads as broken too.
 */
export function VariantC({ status }: { status: BridgeStatus }) {
  const quiet = status === "open";
  return (
    <div className="app">
      <Header />
      {!quiet && (
        <div
          role="status"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 9,
            padding: "7px 14px",
            fontSize: 12,
            background: `${TONE[status]}1A`,
            borderBottom: `1px solid ${TONE[status]}66`,
          }}
        >
          <Dot status={status} />
          <span>
            {status === "connecting"
              ? "Reconnecting to Claude…"
              : "Claude is not connected. Operations will not run."}
          </span>
          {status === "closed" && (
            <button
              type="button"
              style={{
                marginLeft: "auto",
                font: "inherit",
                fontSize: 11.5,
                background: "transparent",
                border: "1px solid currentColor",
                borderRadius: 4,
                padding: "2px 8px",
                cursor: "pointer",
              }}
            >
              How to connect
            </button>
          )}
        </div>
      )}
      <div className="main">
        <Rail small={false} />
        <Body
          note={
            quiet
              ? "healthy means silent - there is deliberately nothing on screen right now. Switch status to connecting or closed."
              : "the strip is the whole feature. It exists only while something is wrong."
          }
        />
      </div>
    </div>
  );
}
