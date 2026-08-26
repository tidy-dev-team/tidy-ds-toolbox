// How a Bridge connection state reads to a designer.
//
// Pure, and separate from the component that draws it, because the wording is
// the part that matters and the part a test can hold. The lamp replaced the
// Tidy Doc tab, which is now the only place in the panel that says whether
// Claude is attached - so "not connected" being mistaken for "connecting", or
// either being silently absent, is a support question rather than a cosmetic
// slip.
//
// Three states, not two. `BridgeStatus` is `connecting | open | closed`
// (`operations/ui-bridge.ts`), and the socket's reconnect backoff runs
// `MIN_BACKOFF_MS` 250ms to `MAX_BACKOFF_MS` 10s, so `connecting` is genuinely
// on screen for seconds at a time rather than being a flicker between the other
// two. A two-colour indicator cannot represent it, which is why `tone` has an
// amber and why the label for it is not just a dimmer "not connected".

import type { BridgeStatus } from "./operations/ui-bridge";

/**
 * Which of the three lamp colours to paint. Named by meaning rather than by
 * colour so the stylesheet owns the palette, and so a theme can move the hues
 * without this file having an opinion about hex.
 */
export type BridgeTone = "live" | "pending" | "down";

export interface BridgeStatusPresentation {
  tone: BridgeTone;
  /** Shown beside the lamp while the sidebar is expanded. */
  label: string;
  /**
   * The whole story in one sentence, for the collapsed sidebar's tooltip and
   * for screen readers. Carries what the label cannot: what it means for the
   * designer, not just which state the socket is in.
   */
  detail: string;
}

const PRESENTATION: Record<BridgeStatus, BridgeStatusPresentation> = {
  open: {
    tone: "live",
    label: "Claude connected",
    detail: "Claude is connected. Agent-driven Operations can run.",
  },
  connecting: {
    tone: "pending",
    // Present participle on purpose: this state can last seconds, and a static
    // "not connected" during it makes a working reconnect look like a failure.
    label: "Connecting to Claude…",
    detail: "Connecting to Claude. Waiting for the MCP bridge to answer.",
  },
  closed: {
    tone: "down",
    label: "Claude not connected",
    // Says the cause rather than only the state. The overwhelmingly common
    // reason is that no MCP server is listening, and that is fixed outside
    // Figma, so a designer told only "not connected" has nowhere to go.
    detail:
      "Claude is not connected. Start the Tidy DS MCP server, then this reconnects on its own.",
  },
};

export function describeBridgeStatus(
  status: BridgeStatus,
): BridgeStatusPresentation {
  return PRESENTATION[status];
}
