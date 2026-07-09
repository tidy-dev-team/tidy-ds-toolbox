import { describe, expect, it, beforeEach } from "vitest";

import {
  buildEvent,
  captureUsage,
  classifyMessage,
  getAnalyticsSessionId,
  hashFileKey,
  initAnalyticsSession,
  resetAnalyticsSession,
  setUsageRelay,
} from "./capture";
import { clearUsageBuffer, getBufferSize } from "./buffer";
import type { UsageEvent } from "./types";

const FIGMA_CTX = {
  fileKey: "abc123",
  rootId: "root-id",
};

const NO_FILE_KEY_CTX = {
  fileKey: null,
  rootId: "root-id-fallback",
};

beforeEach(() => {
  resetAnalyticsSession();
  clearUsageBuffer();
  setUsageRelay(null);
});

describe("classifyMessage", () => {
  it("maps a module action to an `action` event", () => {
    expect(
      classifyMessage({ target: "ds-explorer", action: "build-component" }),
    ).toEqual({
      type: "action",
      module: "ds-explorer",
      action: "build-component",
    });
  });

  it("maps the activeModule save-storage write to a `module_open` event", () => {
    expect(
      classifyMessage({
        target: "shell",
        action: "save-storage",
        payload: { key: "activeModule", value: "audit" },
      }),
    ).toEqual({ type: "module_open", module: "audit", action: null });
  });

  it("drops the startup load-storage restore of activeModule (FR5)", () => {
    expect(
      classifyMessage({
        target: "shell",
        action: "load-storage",
        payload: { key: "activeModule" },
      }),
    ).toBeNull();
  });

  it("drops shell save-storage for non-activeModule keys", () => {
    expect(
      classifyMessage({
        target: "shell",
        action: "save-storage",
        payload: { key: "bridgeMode", value: true },
      }),
    ).toBeNull();
  });

  it("drops resize-ui", () => {
    expect(
      classifyMessage({
        target: "shell",
        action: "resize-ui",
        payload: { width: 400 },
      }),
    ).toBeNull();
  });

  it("drops mcp-bridge traffic (FR4)", () => {
    expect(
      classifyMessage({ target: "mcp-bridge", action: "dispatch" }),
    ).toBeNull();
  });

  it("does not surface payload contents on the identity", () => {
    const identity = classifyMessage({
      target: "utilities",
      action: "do-thing",
      payload: { secret: "leak" },
    });
    expect(identity).toEqual({
      type: "action",
      module: "utilities",
      action: "do-thing",
    });
  });
});

describe("hashFileKey", () => {
  it("is deterministic and shaped like 16 hex chars", () => {
    const a = hashFileKey("abc123");
    expect(a).toBe(hashFileKey("abc123"));
    expect(a).toMatch(/^[0-9a-f]{16}$/);
  });

  it("distinguishes different keys", () => {
    expect(hashFileKey("abc123")).not.toBe(hashFileKey("abc124"));
  });
});

describe("buildEvent", () => {
  it("attaches all schema-v2 fields and no client-identifying data", () => {
    const event = buildEvent(
      { type: "action", module: "audit", action: "generate-report" },
      FIGMA_CTX,
      "sess-1",
      "1.7.0",
      new Date("2026-06-21T10:00:00.000Z"),
    );
    expect(event).toEqual({
      schemaVersion: 2,
      type: "action",
      module: "audit",
      action: "generate-report",
      fileHash: hashFileKey("abc123"),
      pluginVersion: "1.7.0",
      sessionId: "sess-1",
      clientTs: "2026-06-21T10:00:00.000Z",
    });
    expect(JSON.stringify(event)).not.toContain("abc123");
  });

  it("falls back to root.id when fileKey is null (FR7)", () => {
    const event = buildEvent(
      { type: "action", module: "audit", action: "x" },
      NO_FILE_KEY_CTX,
      "sess-1",
      "1.7.0",
    );
    expect(event.fileHash).toBe(hashFileKey("root-id-fallback"));
  });

  it("sets action to null for module_open", () => {
    const event = buildEvent(
      { type: "module_open", module: "audit", action: null },
      FIGMA_CTX,
      "sess-1",
      "1.7.0",
    );
    expect(event.action).toBeNull();
    expect(event.type).toBe("module_open");
  });
});

describe("analytics session", () => {
  it("mints a sessionId once and reuses it", () => {
    const a = initAnalyticsSession();
    const b = initAnalyticsSession();
    expect(a).toBe(b);
    expect(a).toMatch(/^anon_/);
  });

  it("captureUsage uses a stable sessionId across events", () => {
    captureUsage(
      { target: "audit", action: "generate-report" },
      FIGMA_CTX,
      "1.7.0",
    );
    captureUsage(
      { target: "utilities", action: "do-thing" },
      FIGMA_CTX,
      "1.7.0",
    );
    const sid = getAnalyticsSessionId();
    expect(sid).toMatch(/^anon_/);
  });
});

describe("captureUsage (end-to-end)", () => {
  it("emits one action event and appends to the buffer", () => {
    captureUsage(
      { target: "audit", action: "generate-report" },
      FIGMA_CTX,
      "1.7.0",
    );
    expect(getBufferSize()).toBe(1);
  });

  it("emits a module_open event for the activeModule write", () => {
    captureUsage(
      {
        target: "shell",
        action: "save-storage",
        payload: { key: "activeModule", value: "audit" },
      },
      FIGMA_CTX,
      "1.7.0",
    );
    expect(getBufferSize()).toBe(1);
  });

  it("emits nothing for noise (mcp-bridge, load-storage, resize-ui)", () => {
    captureUsage(
      { target: "mcp-bridge", action: "dispatch" },
      FIGMA_CTX,
      "1.7.0",
    );
    captureUsage(
      {
        target: "shell",
        action: "load-storage",
        payload: { key: "activeModule" },
      },
      FIGMA_CTX,
      "1.7.0",
    );
    captureUsage(
      { target: "shell", action: "resize-ui", payload: { width: 400 } },
      FIGMA_CTX,
      "1.7.0",
    );
    expect(getBufferSize()).toBe(0);
  });

  it("swallows a thrown error without throwing (FR9)", () => {
    // A payload whose `key` getter throws exercises the FR9 safety wrap.
    const throwingPayload = {
      get key(): string {
        throw new Error("boom");
      },
    };
    expect(() =>
      captureUsage(
        { target: "shell", action: "save-storage", payload: throwingPayload },
        FIGMA_CTX,
        "1.7.0",
      ),
    ).not.toThrow();
    expect(getBufferSize()).toBe(0);
  });
});

describe("usage relay (#43)", () => {
  it("forwards each emitted event to the registered relay", () => {
    const relayed: UsageEvent[] = [];
    setUsageRelay((e) => relayed.push(e));

    captureUsage(
      { target: "audit", action: "generate-report" },
      FIGMA_CTX,
      "1.7.0",
    );

    expect(relayed).toHaveLength(1);
    expect(relayed[0]).toMatchObject({
      type: "action",
      module: "audit",
      action: "generate-report",
      fileHash: hashFileKey("abc123"),
    });
  });

  it("does not relay events that are classified as noise", () => {
    const relayed: UsageEvent[] = [];
    setUsageRelay((e) => relayed.push(e));

    captureUsage({ target: "mcp-bridge", action: "dispatch" }, FIGMA_CTX, "x");

    expect(relayed).toHaveLength(0);
  });

  it("swallows a throwing relay without throwing, still buffering the event (FR4)", () => {
    setUsageRelay(() => {
      throw new Error("network exploded");
    });

    expect(() =>
      captureUsage(
        { target: "utilities", action: "do-thing" },
        FIGMA_CTX,
        "1.7.0",
      ),
    ).not.toThrow();
    // The relay failure must not stop the event reaching the local buffer.
    expect(getBufferSize()).toBe(1);
  });
});
