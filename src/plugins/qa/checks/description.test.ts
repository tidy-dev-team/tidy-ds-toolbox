import { describe, it, expect } from "vitest";
import { checkDescription } from "./description";
import type { ComponentSetSnapshot } from "../snapshot";

/**
 * Minimal fixture builder — only `id`/`name`/`description` matter to this
 * check, but the type wants a full ComponentSetSnapshot so we fill in empty
 * defaults.
 */
function fixture(
  id: string,
  name: string,
  description: string,
): ComponentSetSnapshot {
  return {
    id,
    name,
    type: "COMPONENT_SET",
    description,
    propertyNames: [],
    properties: [],
    variants: [],
  };
}

const ALIAS_LINE = "Also known as: Btn, Button CTA";
const MISPRINT_LINE =
  "---------------------------------------------------- misprint: abc123";

describe("checkDescription", () => {
  it("fails an empty description", () => {
    const result = checkDescription(fixture("1:1", "Button", ""));
    expect(result.checkId).toBe("description");
    expect(result.status).toBe("fail");
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]).toMatchObject({
      nodeId: "1:1",
      nodeName: "Button",
    });
  });

  it("warns when missing the 'Also known as:' line, as its own finding", () => {
    const result = checkDescription(
      fixture("1:2", "Button", `Some notes.\n${MISPRINT_LINE}`),
    );
    expect(result.status).toBe("warn");
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0].message).toMatch(/also known as/i);
  });

  it("warns when missing the misprint marker, as its own finding", () => {
    const result = checkDescription(
      fixture("1:3", "Button", `Some notes.\n${ALIAS_LINE}`),
    );
    expect(result.status).toBe("warn");
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0].message).toMatch(/misprint/i);
  });

  it("warns with two separate findings when both are missing", () => {
    const result = checkDescription(
      fixture("1:4", "Button", "Some notes only."),
    );
    expect(result.status).toBe("warn");
    expect(result.findings).toHaveLength(2);
  });

  it("passes a fully populated description", () => {
    const result = checkDescription(
      fixture("1:5", "Button", `Some notes.\n${ALIAS_LINE}\n${MISPRINT_LINE}`),
    );
    expect(result.status).toBe("pass");
    expect(result.findings).toEqual([]);
  });
});
