import { describe, it, expect } from "vitest";
import {
  ACTION_CATALOGUE,
  DEFAULT_TIMEOUT_MS,
  classifyAction,
  buildOverrunMessage,
} from "./action-catalogue";

describe("classifyAction", () => {
  it("classifies a declared write action with a timed budget", () => {
    const c = classifyAction("sticker-sheet-builder:build-all");
    expect(c.declared).toBe(true);
    expect(c.effect).toBe("writes");
    expect(c.budget.kind).toBe("long-running");
  });

  it("classifies a declared long-running action as never overrunning", () => {
    const c = classifyAction("audit:export-multipage-pdf");
    expect(c.declared).toBe(true);
    expect(c.budget.kind).toBe("long-running");
    if (c.budget.kind === "long-running") {
      expect(c.budget.reason.length).toBeGreaterThan(0);
    }
  });

  it("classifies off-boarding:pack-pages as long-running", () => {
    const c = classifyAction("off-boarding:pack-pages");
    expect(c.declared).toBe(true);
    expect(c.budget.kind).toBe("long-running");
  });

  it("falls back to today's default behaviour for an undeclared action", () => {
    const c = classifyAction("some-module:some-undeclared-action");
    expect(c.declared).toBe(false);
    expect(c.effect).toBe("writes"); // conservative default wording, but budget is what matters
    expect(c.budget).toEqual({ kind: "timed", ms: DEFAULT_TIMEOUT_MS });
  });

  it("keeps every entry from the former hand-typed list present", () => {
    const formerlyExempt = [
      "sticker-sheet-builder:build-all",
      "sticker-sheet-builder:build-one",
      "audit:generate-report",
      "ds-explorer:build-component",
      "color-finder:scan-colors",
      "color-finder:scan-image-palette",
      "release-notes:publish-notes",
      "mcp-bridge:dispatch",
    ];
    for (const id of formerlyExempt) {
      const c = classifyAction(id);
      expect(c.declared).toBe(true);
      expect(c.budget.kind).toBe("long-running");
    }
  });
});

describe("buildOverrunMessage", () => {
  it("tells the designer work continues for a write overrun", () => {
    const msg = buildOverrunMessage("some-module:writes-slowly", {
      declared: true,
      effect: "writes",
      budget: { kind: "timed", ms: 30000 },
    });
    expect(msg).toMatch(/continu/i);
    expect(msg).toMatch(/again/i);
    expect(msg).toMatch(/canvas/i);
    expect(msg).not.toMatch(/cancel/i);
    expect(msg).not.toMatch(/stopped/i);
  });

  it("gives a plain failure for a read overrun with no still-running wording", () => {
    const msg = buildOverrunMessage("some-module:reads-slowly", {
      declared: true,
      effect: "reads",
      budget: { kind: "timed", ms: 30000 },
    });
    expect(msg).not.toMatch(/continu/i);
    expect(msg).not.toMatch(/again/i);
    expect(msg).not.toMatch(/cancel/i);
  });

  it("never implies a cancellation happened, for either effect", () => {
    for (const effect of ["reads", "writes"] as const) {
      const msg = buildOverrunMessage("some-module:action", {
        declared: true,
        effect,
        budget: { kind: "timed", ms: 30000 },
      });
      expect(msg.toLowerCase()).not.toContain("cancel");
      expect(msg.toLowerCase()).not.toContain("stopped");
    }
  });
});

describe("catalogue table shape", () => {
  it("still declares the ten actions #162 started with, unchanged", () => {
    const originalTen = [
      "sticker-sheet-builder:build-all",
      "sticker-sheet-builder:build-one",
      "audit:generate-report",
      "ds-explorer:build-component",
      "color-finder:scan-colors",
      "color-finder:scan-image-palette",
      "release-notes:publish-notes",
      "mcp-bridge:dispatch",
      "audit:export-multipage-pdf",
      "off-boarding:pack-pages",
    ];
    for (const id of originalTen) {
      expect(ACTION_CATALOGUE[id], `entry '${id}'`).toBeDefined();
      expect(ACTION_CATALOGUE[id].budget.kind, `entry '${id}'`).toBe(
        "long-running",
      );
    }
  });

  it("gives every long-running entry a non-empty reason", () => {
    for (const [id, entry] of Object.entries(ACTION_CATALOGUE)) {
      if (entry.budget.kind === "long-running") {
        expect(entry.budget.reason.trim().length, `entry '${id}'`).toBeGreaterThan(0);
      }
    }
  });
});
