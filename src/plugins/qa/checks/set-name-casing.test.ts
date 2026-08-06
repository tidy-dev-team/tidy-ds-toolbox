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

  it("passes a kebab-case set name", () => {
    const result = checkSetNameCasing(fixture("1:3", "notification-tag"));
    expect(result.status).toBe("pass");
    expect(result.findings).toEqual([]);
  });

  it("passes a kebab-case set name with digits", () => {
    const result = checkSetNameCasing(fixture("1:4", "button-2"));
    expect(result.status).toBe("pass");
  });

  // The case design ruled on explicitly: `button`, the real name of the set she
  // reviewed, is a bare lowercase word rather than a one-word kebab name, and
  // she called it an error. Guards the deliberately narrow kebab pattern.
  it("fails a bare lowercase set name", () => {
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

  it("fails a snake_case set name", () => {
    const result = checkSetNameCasing(fixture("2:4", "notification_tag"));
    expect(result.status).toBe("fail");
    expect(result.findings[0]).toMatchObject({
      nodeId: "2:4",
      nodeName: "notification_tag",
    });
  });

  // Neither form: capitalised words joined by a dash. Called out because it is
  // the reading of design's comment we did *not* take ("pascal case … there are
  // '-' between words" is self-contradictory), so a future reader can see the
  // rejection is intended rather than an oversight.
  it("fails a dash-joined PascalCase set name", () => {
    const result = checkSetNameCasing(fixture("2:5", "Notification-Tag"));
    expect(result.status).toBe("fail");
  });

  it("fails a trailing-dash set name", () => {
    const result = checkSetNameCasing(fixture("2:6", "notification-"));
    expect(result.status).toBe("fail");
  });
});
