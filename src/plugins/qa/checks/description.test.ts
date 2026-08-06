import { describe, it, expect } from "vitest";
import { checkDescription } from "./description";
import { createMisprintText, scrambleName } from "../../../shared/misprint";
import type { ComponentSetSnapshot } from "../snapshot";

const STORYBOOK_URL = "https://storybook.kido.dev/?path=/docs/button";

/**
 * Minimal fixture builder — only `id`/`name`/`description` and
 * `documentationLinks` matter to this check, but the type wants a full
 * ComponentSetSnapshot so we fill in empty defaults.
 *
 * `documentationLinks` defaults to a Storybook link so the alias/misprint cases
 * below keep asserting exactly the findings they were written for. The
 * Storybook recommendation is a separate concern with its own block at the
 * bottom of the file, and letting it leak into every finding count would make
 * these tests fail for a reason none of them is about.
 */
function fixture(
  id: string,
  name: string,
  description: string,
  documentationLinks: string[] = [STORYBOOK_URL],
): ComponentSetSnapshot {
  return {
    id,
    name,
    type: "COMPONENT_SET",
    description,
    propertyNames: [],
    properties: [],
    variants: [],
    documentationLinks,
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

  describe("the Storybook link recommendation", () => {
    const COMPLETE = `Some notes.\n${ALIAS_LINE}\n${MISPRINT_LINE}`;

    it("recommends a link when neither the description nor the links have one", () => {
      const result = checkDescription(fixture("5:1", "Button", COMPLETE, []));
      expect(result.status).toBe("warn");
      expect(result.findings).toHaveLength(1);
      expect(result.findings[0]).toMatchObject({
        severity: "low",
        nodeId: "5:1",
      });
      expect(result.findings[0].message).toMatch(/storybook/i);
    });

    it("accepts a link in the documentation link field", () => {
      const result = checkDescription(
        fixture("5:2", "Button", COMPLETE, [STORYBOOK_URL]),
      );
      expect(result.status).toBe("pass");
      expect(result.findings).toEqual([]);
    });

    it("accepts a link in the description prose", () => {
      const result = checkDescription(
        fixture("5:3", "Button", `${COMPLETE}\n${STORYBOOK_URL}`, []),
      );
      expect(result.status).toBe("pass");
    });

    // A mention is not a link, so prose that only names Storybook still gets
    // the recommendation.
    it("does not accept a bare mention of Storybook in the prose", () => {
      const result = checkDescription(
        fixture("5:4", "Button", `${COMPLETE}\nSee Storybook for states.`, []),
      );
      expect(result.status).toBe("warn");
      expect(result.findings[0].message).toMatch(/storybook/i);
    });

    it("ignores an unrelated documentation link", () => {
      const result = checkDescription(
        fixture("5:5", "Button", COMPLETE, ["https://wiki.kido.dev/button"]),
      );
      expect(result.status).toBe("warn");
      expect(result.findings[0].message).toMatch(/storybook/i);
    });

    // Never escalates: even alone on an otherwise complete description the
    // recommendation warns, because design asked for advice, not a gate.
    it("never turns a complete description into a fail", () => {
      const result = checkDescription(fixture("5:6", "Button", COMPLETE, []));
      expect(result.status).not.toBe("fail");
    });

    // An empty description is already a fail for its own reason; the missing
    // link is reported alongside rather than swallowed by the early return.
    it("is reported alongside an empty description", () => {
      const result = checkDescription(fixture("5:7", "Button", "", []));
      expect(result.status).toBe("fail");
      expect(result.findings).toHaveLength(2);
      expect(result.findings[1].message).toMatch(/storybook/i);
    });

    it("is not reported for an empty description that has the link", () => {
      const result = checkDescription(
        fixture("5:8", "Button", "", [STORYBOOK_URL]),
      );
      expect(result.status).toBe("fail");
      expect(result.findings).toHaveLength(1);
    });
  });
});
