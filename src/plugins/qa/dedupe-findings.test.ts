import { describe, expect, it } from "vitest";
import { dedupeFindings, MAX_REPORTED_NODES } from "./dedupe-findings";
import type { Finding } from "./types";

function finding(overrides: Partial<Finding> = {}): Finding {
  return {
    severity: "medium",
    nodeId: "1:1",
    nodeName: "Right Icon",
    message: `"Right Icon" paddingRight is 4 but not bound to a spacing variable.`,
    expected: "Spacing bound to a variable",
    actual: "4",
    ...overrides,
  };
}

/** The real shape from the 64-variant Button: one shared layer, 56 variants. */
function sharedLayerAcrossVariants(n: number): Finding[] {
  return Array.from({ length: n }, (_, i) =>
    finding({ nodeId: `2625:${10450 + i}` }),
  );
}

describe("dedupeFindings", () => {
  it("returns an empty array for no findings", () => {
    expect(dedupeFindings([])).toEqual([]);
  });

  it("leaves a single finding untouched, without adding count or nodeIds", () => {
    // Terse payloads: a lone finding gains nothing from either field.
    expect(dedupeFindings([finding()])).toEqual([finding()]);
  });

  it("collapses one shared layer across 56 variants into a single finding", () => {
    // The measured case: 170 findings on row 5 were four defects, one layer
    // accounting for 168 of them.
    const result = dedupeFindings(sharedLayerAcrossVariants(56));
    expect(result).toHaveLength(1);
    expect(result[0].count).toBe(56);
  });

  it("keeps jump-to-node working by listing the offending node ids", () => {
    const result = dedupeFindings(sharedLayerAcrossVariants(3));
    expect(result[0].nodeIds).toEqual([
      "2625:10450",
      "2625:10451",
      "2625:10452",
    ]);
    // The representative stays addressable on its own, as before.
    expect(result[0].nodeId).toBe("2625:10450");
  });

  it("caps the node id list, since count carries the true magnitude", () => {
    // Nobody walks 50 ids by hand, and on the real Button the id lists became
    // the bulk of the payload the dedupe was meant to shrink.
    const result = dedupeFindings(
      sharedLayerAcrossVariants(MAX_REPORTED_NODES + 10),
    );
    expect(result[0].nodeIds).toHaveLength(MAX_REPORTED_NODES);
    expect(result[0].count).toBe(MAX_REPORTED_NODES + 10);
  });

  describe("nodeNames", () => {
    function differentlyNamed(names: string[]): Finding[] {
      return names.map((name, i) =>
        finding({
          nodeId: `1:${i}`,
          nodeName: name,
          message: `Fill #FFFFFF on "${name}" is a raw value.`,
        }),
      );
    }

    it("names the offenders when the merged findings disagree on the name", () => {
      // Measured on the real Button: two variant roots with a hardcoded white
      // fill merged to `"…"`, and the message alone no longer said which.
      const result = dedupeFindings(
        differentlyNamed([
          "variant=ghost, size=lg, state=focused",
          "variant=ghost, size=md, state=focused",
        ]),
      );
      expect(result).toHaveLength(1);
      expect(result[0].message).toContain('"…"');
      expect(result[0].nodeNames).toEqual([
        "variant=ghost, size=lg, state=focused",
        "variant=ghost, size=md, state=focused",
      ]);
    });

    it("omits nodeNames when every merged node shares its name", () => {
      // `nodeName` already carries it; repeating it 56 times says nothing.
      const result = dedupeFindings(sharedLayerAcrossVariants(56));
      expect(result[0].nodeNames).toBeUndefined();
      expect(result[0].nodeName).toBe("Right Icon");
    });

    it("omits nodeNames when nothing was merged", () => {
      expect(dedupeFindings([finding()])[0].nodeNames).toBeUndefined();
    });

    it("lists each distinct name once, however many nodes carry it", () => {
      const result = dedupeFindings(
        differentlyNamed(["Icon A", "Icon B", "Icon A", "Icon B", "Icon C"]),
      );
      expect(result[0].nodeNames).toEqual(["Icon A", "Icon B", "Icon C"]);
      expect(result[0].count).toBe(5);
    });

    it("caps the name list too", () => {
      const names = Array.from(
        { length: MAX_REPORTED_NODES + 5 },
        (_, i) => `Icon ${i}`,
      );
      const result = dedupeFindings(differentlyNamed(names));
      expect(result[0].nodeNames).toHaveLength(MAX_REPORTED_NODES);
    });
  });

  it("keeps distinct kinds apart", () => {
    const result = dedupeFindings([
      finding({ message: `"Right Icon" paddingRight is 4 but not bound.` }),
      finding({ message: `"Right Icon" paddingLeft is 4 but not bound.` }),
      finding({ message: `"Right Icon" itemSpacing is 10 but not bound.` }),
    ]);
    expect(result).toHaveLength(3);
  });

  it("treats differing expected/actual as different kinds", () => {
    const result = dedupeFindings([
      finding({ actual: "4" }),
      finding({ actual: "10" }),
    ]);
    expect(result).toHaveLength(2);
  });

  it("keeps the shared layer name in the message when every node shares it", () => {
    // Redacting here would throw away the single most useful word in the
    // finding: which layer to open.
    const result = dedupeFindings(sharedLayerAcrossVariants(56));
    expect(result[0].message).toContain('"Right Icon"');
    expect(result[0].message).not.toContain('"…"');
    expect(result[0].nodeName).toBe("Right Icon");
  });

  it("redacts the layer name when the merged findings do not share one", () => {
    // Here the name is what differed, so naming one of them would be a lie.
    const result = dedupeFindings([
      finding({
        nodeId: "1:1",
        nodeName: "Icon A",
        message: `"Icon A" is off grid.`,
      }),
      finding({
        nodeId: "1:2",
        nodeName: "Icon B",
        message: `"Icon B" is off grid.`,
      }),
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].message).toBe('"…" is off grid.');
    expect(result[0].nodeName).toBe("…");
  });

  it("sums pre-deduped counts rather than counting findings", () => {
    // Tier 2 checks already aggregate and carry `count`; re-running dedupe over
    // their output must not collapse 2+3 into 2.
    const result = dedupeFindings([
      finding({ count: 2 }),
      finding({ nodeId: "1:2", count: 3 }),
    ]);
    expect(result[0].count).toBe(5);
  });

  it("is idempotent, so a deduped list survives a second pass unchanged", () => {
    const once = dedupeFindings(sharedLayerAcrossVariants(56));
    expect(dedupeFindings(once)).toEqual(once);
  });

  it("promotes the group to the highest severity present", () => {
    const result = dedupeFindings([
      finding({ severity: "low" }),
      finding({ nodeId: "1:2", severity: "high" }),
    ]);
    expect(result[0].severity).toBe("high");
  });

  it("orders by severity, then by count, then stably by message", () => {
    const result = dedupeFindings([
      finding({ severity: "low", message: "z low." }),
      finding({ severity: "high", message: "high." }),
      finding({ severity: "low", message: "a low." }),
      finding({ severity: "medium", message: "medium one." }),
      finding({ severity: "medium", message: "medium two." }),
      finding({ severity: "medium", nodeId: "1:9", message: "medium two." }),
    ]);
    expect(result.map((f) => f.message)).toEqual([
      "high.",
      "medium two.", // medium, count 2 - outranks the count-1 medium
      "medium one.",
      "a low.",
      "z low.",
    ]);
  });

  it("preserves the other reported fields from the representative", () => {
    const result = dedupeFindings([
      finding({ suggestedFix: "Bind it." }),
      finding({ nodeId: "1:2", suggestedFix: "Bind it." }),
    ]);
    expect(result[0].expected).toBe("Spacing bound to a variable");
    expect(result[0].actual).toBe("4");
    expect(result[0].suggestedFix).toBe("Bind it.");
  });
});
