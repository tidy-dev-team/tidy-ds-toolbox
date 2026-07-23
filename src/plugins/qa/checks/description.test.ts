import { describe, it, expect } from "vitest";
import { checkDescription } from "./description";
import { createMisprintText, scrambleName } from "../../../shared/misprint";
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
// A *correct* marker for a node named "Button" (real scramble payload).
const MISPRINT_LINE = createMisprintText("Button");

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

  it("warns when the marker payload does not match the current name (stale misprint)", () => {
    // Marker was written for the old name "Btn", node is now "Button".
    const stale = createMisprintText("Btn");
    const result = checkDescription(
      fixture("1:6", "Button", `Some notes.\n${ALIAS_LINE}\n${stale}`),
    );
    expect(result.status).toBe("warn");
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0].message).toMatch(/misprint/i);
    expect(result.findings[0].message).toMatch(/does not match|stale|wrong/i);
    expect(result.findings[0].actual).toBe(scrambleName("Btn"));
    expect(result.findings[0].expected).toBe(scrambleName("Button"));
  });

  it("treats a casing/prefix-variant marker as present, and validates its payload", () => {
    // No dash prefix, capitalised label — still the marker, and payload is correct.
    const variant = `Misprint: ${scrambleName("Button")}`;
    const result = checkDescription(
      fixture("1:7", "Button", `Some notes.\n${ALIAS_LINE}\n${variant}`),
    );
    expect(result.status).toBe("pass");
    expect(result.findings).toEqual([]);
  });

  it("flags a prefix-variant marker whose payload is wrong", () => {
    const variant = "-- Misprint: zzz";
    const result = checkDescription(
      fixture("1:8", "Button", `Some notes.\n${ALIAS_LINE}\n${variant}`),
    );
    expect(result.status).toBe("warn");
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0].message).toMatch(/misprint/i);
    expect(result.findings[0].actual).toBe("zzz");
  });
});
