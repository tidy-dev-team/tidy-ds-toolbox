import { describe, it, expect } from "vitest";
import { checkSetNameCasing } from "./set-name-casing";
import type { ComponentSetSnapshot } from "../snapshot";

/**
 * Minimal fixture builder — only `id`/`name` matter to this check, but the
 * type wants a full ComponentSetSnapshot so we fill in empty defaults.
 */
function fixture(id: string, name: string): ComponentSetSnapshot {
  return {
    id,
    name,
    type: "COMPONENT_SET",
    description: "",
    propertyNames: [],
    properties: [],
    variants: [],
  };
}

describe("checkSetNameCasing", () => {
  it("passes a PascalCase set name", () => {
    const result = checkSetNameCasing(fixture("1:1", "Button"));
    expect(result).toEqual({
      checkId: "set-name-casing",
      title: "Component set name casing",
      status: "pass",
      findings: [],
    });
  });

  it("passes a multi-word PascalCase set name", () => {
    const result = checkSetNameCasing(fixture("1:2", "NotificationTag"));
    expect(result.status).toBe("pass");
    expect(result.findings).toEqual([]);
  });

  it("fails a lowercase set name", () => {
    const result = checkSetNameCasing(fixture("2:1", "button"));
    expect(result.status).toBe("fail");
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]).toMatchObject({
      nodeId: "2:1",
      nodeName: "button",
    });
  });

  it("fails a spaced set name", () => {
    const result = checkSetNameCasing(fixture("2:2", "Notification Tag"));
    expect(result.status).toBe("fail");
    expect(result.findings[0]).toMatchObject({
      nodeId: "2:2",
      nodeName: "Notification Tag",
    });
  });

  it("fails a kebab-case set name", () => {
    const result = checkSetNameCasing(fixture("2:3", "notification-tag"));
    expect(result.status).toBe("fail");
    expect(result.findings[0]).toMatchObject({
      nodeId: "2:3",
      nodeName: "notification-tag",
    });
  });

  it("fails a snake_case set name", () => {
    const result = checkSetNameCasing(fixture("2:4", "notification_tag"));
    expect(result.status).toBe("fail");
    expect(result.findings[0]).toMatchObject({
      nodeId: "2:4",
      nodeName: "notification_tag",
    });
  });
});
