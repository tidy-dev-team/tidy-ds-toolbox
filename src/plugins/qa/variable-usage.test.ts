import { describe, it, expect } from "vitest";
import {
  collectVariableUsage,
  colorStyleVariableIds,
  nodesPinning,
} from "./variable-usage";
import type { ComponentSetSnapshot, NodeSnapshot } from "./snapshot";

let seq = 0;

function node(overrides: Partial<NodeSnapshot> = {}): NodeSnapshot {
  seq += 1;
  return {
    id: `1:${seq}`,
    name: "layer",
    type: "FRAME",
    visible: true,
    width: 24,
    height: 24,
    children: [],
    ...overrides,
  };
}

function fixture(
  trees: NodeSnapshot[][],
  extra: Partial<ComponentSetSnapshot> = {},
): ComponentSetSnapshot {
  return {
    id: "1:0",
    name: "Button",
    type: "COMPONENT_SET",
    description: "",
    propertyNames: [],
    properties: [],
    variants: trees.map((kids, i) => ({
      id: `v:${i}`,
      name: `Button-${i}`,
      variantProperties: {},
      tree: node({ id: `v:${i}`, type: "COMPONENT", children: kids }),
    })),
    ...extra,
  };
}

describe("collectVariableUsage", () => {
  it("counts a paint-bound variable once, not once per representation", () => {
    // Figma records a paint binding twice: on the paint itself, and in the
    // node's own `boundVariables.fills`.
    // Counting both doubled every paint-bound variable.
    const layer = node({
      name: "bg",
      fills: [
        {
          type: "SOLID",
          visible: true,
          opacity: 1,
          hex: "#123456",
          boundVariableId: "v-bg",
        },
      ],
      boundVariableIds: ["v-bg"],
    });

    const usage = collectVariableUsage(fixture([[layer]]));

    expect(usage.get("v-bg")?.count).toBe(1);
    expect(usage.get("v-bg")?.nodeName).toBe("bg");
  });

  it("counts one usage per consuming layer", () => {
    const usage = collectVariableUsage(
      fixture([
        [node({ name: "a", boundVariableIds: ["v-gap"] })],
        [node({ name: "b", boundVariableIds: ["v-gap"] })],
      ]),
    );
    expect(usage.get("v-gap")?.count).toBe(2);
  });

  it("counts variables bound to component properties, attributed to the set", () => {
    // These bindings live on the property definition, not on any layer, so a
    // set whose only variable use is a bound property would otherwise look
    // like it uses no variables at all.
    const usage = collectVariableUsage(
      fixture([[node()]], {
        properties: [
          {
            name: "Label",
            key: "Label#1:2",
            type: "TEXT",
            boundVariableIds: ["v-label"],
          },
        ],
      }),
    );
    expect(usage.get("v-label")?.count).toBe(1);
    expect(usage.get("v-label")?.nodeId).toBe("1:0");
    expect(usage.get("v-label")?.nodeName).toBe("Button");
  });
});

describe("colorStyleVariableIds", () => {
  it("collects variables bound inside the set's fill styles, deduped", () => {
    const ids = colorStyleVariableIds(
      fixture([[node()]], {
        colorStyles: {
          "S:a": {
            name: "Surface/Card",
            paints: [
              {
                type: "SOLID",
                visible: true,
                opacity: 1,
                hex: "#FFFFFF",
                boundVariableId: "v-surface",
              },
            ],
          },
          "S:b": {
            name: "Surface/Card Alt",
            paints: [
              {
                type: "SOLID",
                visible: true,
                opacity: 1,
                hex: "#FFFFFF",
                boundVariableId: "v-surface",
              },
            ],
          },
        },
      }),
    );
    expect(ids).toEqual(["v-surface"]);
  });

  it("stays separate from the usage counts a set is answerable for", () => {
    // A variable reached only through a shared style has no binding layer, so
    // #17 must not raise a finding against a component that merely applied the
    // style - which is why these ids never enter collectVariableUsage.
    const snapshot = fixture([[node()]], {
      colorStyles: {
        "S:a": {
          name: "Surface/Card",
          paints: [
            {
              type: "SOLID",
              visible: true,
              opacity: 1,
              hex: "#FFFFFF",
              boundVariableId: "v-surface",
            },
          ],
        },
      },
    });
    expect(collectVariableUsage(snapshot).has("v-surface")).toBe(false);
  });

  it("is empty when the set references no fill styles", () => {
    expect(colorStyleVariableIds(fixture([[node()]]))).toEqual([]);
  });
});

describe("nodesPinning", () => {
  it("finds a pin on a layer", () => {
    const pinned = nodesPinning(
      fixture([
        [
          node({
            id: "1:9",
            name: "pinned",
            explicitVariableModes: { "c-theme": "m-core" },
          }),
        ],
      ]),
      "c-theme",
    );
    expect(pinned).toEqual([{ id: "1:9", name: "pinned" }]);
  });

  it("finds a pin on the set or an enclosing frame", () => {
    // The snapshot's node trees start at the variants, below the set itself, so
    // an ancestor pin is invisible to a tree walk.
    // It still sets the mode context for every variant.
    const pinned = nodesPinning(
      fixture([[node()]], {
        pinnedAncestors: [
          {
            id: "0:5",
            name: "QA page",
            explicitVariableModes: { "c-theme": "m-dna" },
          },
        ],
      }),
      "c-theme",
    );
    expect(pinned).toEqual([{ id: "0:5", name: "QA page" }]);
  });

  it("ignores an ancestor pinning some other collection", () => {
    const pinned = nodesPinning(
      fixture([[node()]], {
        pinnedAncestors: [
          {
            id: "0:5",
            name: "QA page",
            explicitVariableModes: { "c-density": "m-compact" },
          },
        ],
      }),
      "c-theme",
    );
    expect(pinned).toEqual([]);
  });
});
