import { describe, it, expect } from "vitest";
import { checkVariantPropertyBindings } from "./variant-property-bindings";
import type {
  ComponentPropertySnapshot,
  ComponentSetSnapshot,
  NodeSnapshot,
  VariantSnapshot,
} from "../snapshot";

const SHOW_LEFT = "Show Left Icon#1:2";
const SHOW_RIGHT = "Show Right Icon#3:4";

function node(
  name: string,
  overrides: Partial<NodeSnapshot> = {},
): NodeSnapshot {
  return {
    id: `n-${name}`,
    name,
    type: "FRAME",
    visible: true,
    width: 24,
    height: 24,
    children: [],
    ...overrides,
  };
}

/** A layer bound to a property via its visibility, i.e. a wired boolean. */
function bound(name: string, key: string, visible = false): NodeSnapshot {
  return node(name, { visible, propertyReferences: { visible: key } });
}

function variant(
  variantProperties: Record<string, string>,
  children: NodeSnapshot[],
): VariantSnapshot {
  const label = Object.values(variantProperties).join("-") || "solo";
  return {
    id: `v-${label}`,
    name: label,
    variantProperties,
    tree: node(label, { id: `v-${label}`, type: "COMPONENT", children }),
  };
}

function prop(
  name: string,
  key: string,
  type = "BOOLEAN",
): ComponentPropertySnapshot {
  return { name, key, type };
}

function fixture(
  properties: ComponentPropertySnapshot[],
  variants: VariantSnapshot[],
): ComponentSetSnapshot {
  return {
    id: "1:1",
    name: "Button",
    type: "COMPONENT_SET",
    description: "",
    propertyNames: properties.map((p) => p.name),
    properties,
    variants,
  };
}

describe("checkVariantPropertyBindings (#3)", () => {
  it("passes when every bindable property is wired in every variant", () => {
    const result = checkVariantPropertyBindings(
      fixture(
        [prop("Show Left Icon", SHOW_LEFT)],
        [
          variant({ Variant: "Primary" }, [bound("icon-left", SHOW_LEFT)]),
          variant({ Variant: "Ghost" }, [bound("icon-left", SHOW_LEFT)]),
        ],
      ),
    );
    expect(result.status).toBe("pass");
    expect(result.findings).toEqual([]);
  });

  it("fails and names every variant where the property is unwired", () => {
    // The defect: Figma puts the definition on the set so the toggle shows on
    // all three, but only Primary carries a binding.
    const result = checkVariantPropertyBindings(
      fixture(
        [prop("Show Left Icon", SHOW_LEFT)],
        [
          variant({ Variant: "Primary" }, [bound("icon-left", SHOW_LEFT)]),
          variant({ Variant: "Ghost" }, [node("icon-left")]),
          variant({ Variant: "Danger" }, [node("icon-left")]),
        ],
      ),
    );
    expect(result.status).toBe("fail");
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0].severity).toBe("high");
    expect(result.findings[0].count).toBe(2);
    expect(result.findings[0].message).toContain("2 of 3");
    expect(result.findings[0].message).toContain("Variant=Ghost");
    expect(result.findings[0].message).toContain("Variant=Danger");
  });

  it("names the unbound layer to fix, and anchors the finding to it", () => {
    // Variants get duplicated, so the layer survives while the binding is lost.
    // Pointing at that layer is the difference between a correct finding and a
    // useful one.
    const result = checkVariantPropertyBindings(
      fixture(
        [prop("Show Left Icon", SHOW_LEFT)],
        [
          variant({ Variant: "Primary" }, [bound("icon-left", SHOW_LEFT)]),
          variant({ Variant: "Ghost" }, [node("icon-left")]),
        ],
      ),
    );
    expect(result.findings[0].message).toContain(
      '"icon-left" is present and unbound',
    );
    expect(result.findings[0].nodeName).toBe("icon-left");
  });

  it("calls out an unbound layer left visible, which cannot be switched off", () => {
    // The nastier shape of the same defect: it looks correct at rest, and the
    // icon shows regardless of the toggle.
    const result = checkVariantPropertyBindings(
      fixture(
        [prop("Show Left Icon", SHOW_LEFT)],
        [
          variant({ Variant: "Primary" }, [bound("icon-left", SHOW_LEFT)]),
          variant({ Variant: "Ghost" }, [node("icon-left", { visible: true })]),
        ],
      ),
    );
    expect(result.findings[0].message).toContain("cannot be switched off");
  });

  it("stays silent about a stuck layer when the unbound layer is hidden", () => {
    const result = checkVariantPropertyBindings(
      fixture(
        [prop("Show Left Icon", SHOW_LEFT)],
        [
          variant({ Variant: "Primary" }, [bound("icon-left", SHOW_LEFT)]),
          variant({ Variant: "Ghost" }, [
            node("icon-left", { visible: false }),
          ]),
        ],
      ),
    );
    expect(result.findings[0].message).not.toContain("cannot be switched off");
  });

  it("finds bindings at any depth, not just on direct children", () => {
    const result = checkVariantPropertyBindings(
      fixture(
        [prop("Show Left Icon", SHOW_LEFT)],
        [
          variant({ Variant: "Primary" }, [
            node("content", { children: [bound("icon-left", SHOW_LEFT)] }),
          ]),
          variant({ Variant: "Ghost" }, [
            node("content", { children: [bound("icon-left", SHOW_LEFT)] }),
          ]),
        ],
      ),
    );
    expect(result.status).toBe("pass");
  });

  it("fails a property bound to no layer in any variant", () => {
    const result = checkVariantPropertyBindings(
      fixture(
        [prop("Show Left Icon", SHOW_LEFT)],
        [
          variant({ Variant: "Primary" }, [node("icon-left")]),
          variant({ Variant: "Ghost" }, [node("icon-left")]),
        ],
      ),
    );
    expect(result.status).toBe("fail");
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0].message).toContain("bound to no layer in any");
  });

  it("reports each property separately", () => {
    const result = checkVariantPropertyBindings(
      fixture(
        [
          prop("Show Left Icon", SHOW_LEFT),
          prop("Show Right Icon", SHOW_RIGHT),
        ],
        [
          variant({ Variant: "Primary" }, [
            bound("icon-left", SHOW_LEFT),
            bound("icon-right", SHOW_RIGHT),
          ]),
          variant({ Variant: "Ghost" }, [
            node("icon-left"),
            node("icon-right"),
          ]),
        ],
      ),
    );
    expect(result.findings).toHaveLength(2);
    expect(result.findings.map((f) => f.expected)).toEqual([
      '"Show Left Icon" bound in every variant',
      '"Show Right Icon" bound in every variant',
    ]);
  });

  it("joins on the suffixed key, not the display name", () => {
    // A binding referencing a *different* property that happens to strip to a
    // similar name must not count as wiring this one.
    const result = checkVariantPropertyBindings(
      fixture(
        [prop("Show Left Icon", SHOW_LEFT)],
        [variant({ Variant: "Primary" }, [bound("icon-left", SHOW_RIGHT)])],
      ),
    );
    expect(result.status).toBe("fail");
    expect(result.findings[0].message).toContain("bound to no layer in any");
  });

  it("covers instance-swap properties, which bind via mainComponent", () => {
    const swap = prop("Icon", "Icon#5:6", "INSTANCE_SWAP");
    const wiredSwap = node("icon", {
      type: "INSTANCE",
      propertyReferences: { mainComponent: "Icon#5:6" },
    });
    const result = checkVariantPropertyBindings(
      fixture(
        [swap],
        [
          variant({ Size: "Small" }, [wiredSwap]),
          variant({ Size: "Large" }, [node("icon", { type: "INSTANCE" })]),
        ],
      ),
    );
    expect(result.status).toBe("fail");
    expect(result.findings[0].count).toBe(1);
  });

  it("covers text properties, which bind via characters", () => {
    const text = prop("Label", "Label#7:8", "TEXT");
    const wiredText = node("label", {
      type: "TEXT",
      propertyReferences: { characters: "Label#7:8" },
    });
    const result = checkVariantPropertyBindings(
      fixture(
        [text],
        [
          variant({ Size: "Small" }, [wiredText]),
          variant({ Size: "Large" }, [node("label", { type: "TEXT" })]),
        ],
      ),
    );
    expect(result.status).toBe("fail");
  });

  it("ignores variant properties, which carry no layer binding", () => {
    const result = checkVariantPropertyBindings(
      fixture(
        [prop("Size", "Size", "VARIANT")],
        [variant({ Size: "Small" }, []), variant({ Size: "Large" }, [])],
      ),
    );
    expect(result.status).toBe("not_applicable");
    expect(result.note).toContain("nothing to wire");
  });

  it("is not_applicable for a set with no bindable properties at all", () => {
    const result = checkVariantPropertyBindings(
      fixture([], [variant({ Size: "Small" }, [])]),
    );
    expect(result.status).toBe("not_applicable");
    expect(result.findings).toEqual([]);
  });

  it("still catches a dead property on a standalone component", () => {
    // One variant means partial wiring is impossible, but a property bound to
    // nothing is still a toggle that does nothing.
    const result = checkVariantPropertyBindings(
      fixture(
        [prop("Show Left Icon", SHOW_LEFT)],
        [variant({}, [node("icon")])],
      ),
    );
    expect(result.status).toBe("fail");
  });

  describe("odd binding target", () => {
    function withTargets(names: string[]): ComponentSetSnapshot {
      return fixture(
        [prop("Show Left Icon", SHOW_LEFT)],
        names.map((layerName, i) =>
          variant({ Variant: `V${i}` }, [bound(layerName, SHOW_LEFT)]),
        ),
      );
    }

    it("warns when one variant binds a differently-named layer than the rest", () => {
      const result = checkVariantPropertyBindings(
        withTargets(["icon-left", "icon-left", "icon-left", "icon-right"]),
      );
      expect(result.status).toBe("warn");
      expect(result.findings).toHaveLength(1);
      expect(result.findings[0].severity).toBe("medium");
      expect(result.findings[0].message).toContain("crossed binding");
      expect(result.findings[0].message).toContain("Variant=V3");
      expect(result.findings[0].count).toBe(1);
    });

    it("stays quiet without a clear majority, since there is no convention to violate", () => {
      const result = checkVariantPropertyBindings(
        withTargets(["icon-left", "icon-left", "icon-right", "icon-right"]),
      );
      expect(result.status).toBe("pass");
    });

    it("stays quiet on small sets, where a majority means little", () => {
      const result = checkVariantPropertyBindings(
        withTargets(["icon-left", "icon-right"]),
      );
      expect(result.status).toBe("pass");
    });

    it("stays quiet when a property legitimately drives several layers", () => {
      const multi = fixture(
        [prop("Show Left Icon", SHOW_LEFT)],
        [
          variant({ Variant: "A" }, [
            bound("icon-left", SHOW_LEFT),
            bound("spacer", SHOW_LEFT),
          ]),
          variant({ Variant: "B" }, [bound("icon-left", SHOW_LEFT)]),
          variant({ Variant: "C" }, [bound("icon-left", SHOW_LEFT)]),
        ],
      );
      expect(checkVariantPropertyBindings(multi).status).toBe("pass");
    });

    it("does not soften a wiring failure to warn", () => {
      const result = checkVariantPropertyBindings(
        fixture(
          [prop("Show Left Icon", SHOW_LEFT)],
          [
            variant({ Variant: "A" }, [bound("icon-left", SHOW_LEFT)]),
            variant({ Variant: "B" }, [bound("icon-left", SHOW_LEFT)]),
            variant({ Variant: "C" }, [bound("icon-right", SHOW_LEFT)]),
            variant({ Variant: "D" }, [node("icon-left")]),
          ],
        ),
      );
      expect(result.status).toBe("fail");
      expect(result.findings).toHaveLength(2);
    });
  });

  it("summarises rather than listing every variant on a large set", () => {
    const variants = Array.from({ length: 12 }, (_, i) =>
      variant({ Variant: `V${i}` }, [node("icon-left")]),
    );
    variants[0] = variant({ Variant: "V0" }, [bound("icon-left", SHOW_LEFT)]);
    const result = checkVariantPropertyBindings(
      fixture([prop("Show Left Icon", SHOW_LEFT)], variants),
    );
    expect(result.findings[0].count).toBe(11);
    expect(result.findings[0].message).toContain("and 5 more");
  });

  it("always leaves the render checks outstanding, on every outcome", () => {
    // Item 3 asks for combinations cycled, long text, and icon colour matching
    // text colour. Wiring integrity says nothing about any of that, so - like
    // #7's remainder and unlike #19's - this is owed on every outcome.
    const wired = bound("icon-left", SHOW_LEFT);
    const cases = [
      fixture(
        [prop("Show Left Icon", SHOW_LEFT)],
        [variant({ Variant: "Primary" }, [wired])],
      ), // pass
      fixture(
        [prop("Show Left Icon", SHOW_LEFT)],
        [
          variant({ Variant: "Primary" }, [wired]),
          variant({ Variant: "Ghost" }, [node("icon-left")]),
        ],
      ), // fail
      fixture([prop("Size", "Size", "VARIANT")], [variant({ Size: "S" }, [])]), // not_applicable
    ];
    for (const fx of cases) {
      expect(checkVariantPropertyBindings(fx).manualRemainder).toMatch(
        /long text/,
      );
    }
  });

  it("reports under the right check id and title", () => {
    const result = checkVariantPropertyBindings(
      fixture(
        [prop("Show Left Icon", SHOW_LEFT)],
        [variant({ Variant: "Primary" }, [bound("icon-left", SHOW_LEFT)])],
      ),
    );
    expect(result.checkId).toBe("variant-property-bindings");
    expect(result.title).toBe("Property bindings across variants");
  });
});
