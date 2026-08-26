import { describe, it, expect } from "vitest";
import type { BridgeStatus } from "./operations/ui-bridge";
import { describeBridgeStatus } from "./bridge-status-presentation";

const ALL: BridgeStatus[] = ["open", "connecting", "closed"];

describe("describeBridgeStatus", () => {
  it("covers every state the socket can be in", () => {
    for (const status of ALL) {
      const p = describeBridgeStatus(status);
      expect(p.label.length).toBeGreaterThan(0);
      expect(p.detail.length).toBeGreaterThan(0);
    }
  });

  // The lamp is the only place in the panel that reports this, so two states
  // reading the same is the failure that matters: a designer cannot tell a
  // reconnect in progress from a dead socket, and waits for one or gives up on
  // the other.
  it("gives every state a distinct tone, label and detail", () => {
    const tones = ALL.map((s) => describeBridgeStatus(s).tone);
    const labels = ALL.map((s) => describeBridgeStatus(s).label);
    const details = ALL.map((s) => describeBridgeStatus(s).detail);

    expect(new Set(tones).size).toBe(ALL.length);
    expect(new Set(labels).size).toBe(ALL.length);
    expect(new Set(details).size).toBe(ALL.length);
  });

  // `connecting` can last seconds - the socket backs off from 250ms to 10s - so
  // it must not read as a settled failure while it is still working.
  it("says connecting is in progress rather than not connected", () => {
    const { label, tone } = describeBridgeStatus("connecting");
    expect(tone).toBe("pending");
    expect(label.toLowerCase()).toContain("connecting");
    expect(label.toLowerCase()).not.toContain("not connected");
  });

  // The usual cause is that no MCP server is listening, which is fixed outside
  // Figma. A designer told only the state has nowhere to go.
  it("tells the designer what to do when the bridge is down", () => {
    const { detail, tone } = describeBridgeStatus("closed");
    expect(tone).toBe("down");
    expect(detail).toMatch(/MCP server/i);
  });

  it("does not claim a connection is live unless it is", () => {
    expect(describeBridgeStatus("open").tone).toBe("live");
    expect(describeBridgeStatus("connecting").tone).not.toBe("live");
    expect(describeBridgeStatus("closed").tone).not.toBe("live");
  });
});
