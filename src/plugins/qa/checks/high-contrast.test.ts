import { describe, it, expect } from "vitest";
import { checkHighContrast } from "./high-contrast";
import type {
  ComponentSetSnapshot,
  NodeSnapshot,
  PaintSnapshot,
  ThemeSnapshot,
} from "../snapshot";

let seq = 0;

function solid(hex: string, extra: Partial<PaintSnapshot> = {}): PaintSnapshot {
  return { type: "SOLID", visible: true, opacity: 1, hex, ...extra };
}

function node(overrides: Partial<NodeSnapshot> = {}): NodeSnapshot {
  seq += 1;
  return {
    id: `1:${seq}`,
    name: "layer",
    type: "FRAME",
    visible: true,
    width: 100,
    height: 40,
    children: [],
    ...overrides,
  };
}

function text(overrides: Partial<NodeSnapshot> = {}): NodeSnapshot {
  return node({
    name: "label",
    type: "TEXT",
    fontSize: 16,
    bold: false,
    ...overrides,
  });
}

/** One variant per tree, each tree given as the variant root's own snapshot. */
function fixture(
  roots: NodeSnapshot[],
  extra: Partial<ComponentSetSnapshot> = {},
): ComponentSetSnapshot {
  return {
    id: "1:0",
    name: "Button",
    type: "COMPONENT_SET",
    description: "",
    propertyNames: [],
    properties: [],
    variants: roots.map((root, i) => ({
      id: `v:${i}`,
      name: `State=${i}`,
      variantProperties: { State: String(i) },
      tree: root,
    })),
    ...extra,
  };
}

/** A frame with `fill` containing one text layer. */
function surface(fill: string, child: NodeSnapshot): NodeSnapshot {
  return node({ name: "surface", fills: [solid(fill)], children: [child] });
}

const messages = (result: { findings: { message: string }[] }) =>
  result.findings.map((f) => f.message);

describe("checkHighContrast", () => {
  it("passes a compliant text/background pair", () => {
    const result = checkHighContrast(
      fixture([surface("#FFFFFF", text({ fills: [solid("#333333")] }))]),
    );
    expect(result.status).toBe("pass");
    expect(result.findings).toEqual([]);
  });

  it("fails a pair below 4.5:1 and quotes the ratio", () => {
    const result = checkHighContrast(
      fixture([surface("#FFFFFF", text({ fills: [solid("#999999")] }))]),
    );
    expect(result.status).toBe("fail");
    expect(result.findings).toHaveLength(1);
    const [finding] = result.findings;
    expect(finding.severity).toBe("high");
    expect(finding.message).toContain("#999999");
    expect(finding.message).toContain("#FFFFFF");
    expect(finding.message).toContain("2.8:1");
    expect(finding.expected).toContain("4.5:1");
    expect(finding.count).toBe(1);
  });

  it("allows 3:1 for large text that would fail as normal text", () => {
    // #767676 on white is 4.54:1; #949494 is ~3.1:1 - under AA normal, over
    // AA large.
    const fills = [solid("#949494")];
    const large = checkHighContrast(
      fixture([surface("#FFFFFF", text({ fills, fontSize: 24 }))]),
    );
    expect(large.status).toBe("pass");

    const normal = checkHighContrast(
      fixture([surface("#FFFFFF", text({ fills, fontSize: 16 }))]),
    );
    expect(normal.status).toBe("fail");
  });

  it("applies the large threshold from 18.66px only when bold", () => {
    const fills = [solid("#949494")];
    const bold = checkHighContrast(
      fixture([
        surface("#FFFFFF", text({ fills, fontSize: 18.66, bold: true })),
      ]),
    );
    expect(bold.status).toBe("pass");

    const regular = checkHighContrast(
      fixture([
        surface("#FFFFFF", text({ fills, fontSize: 18.66, bold: false })),
      ]),
    );
    expect(regular.status).toBe("fail");
  });

  it("reports invisible text as the ratio-1.0 extreme", () => {
    const result = checkHighContrast(
      fixture([surface("#1F1F1F", text({ fills: [solid("#1F1F1F")] }))]),
    );
    expect(result.status).toBe("fail");
    expect(result.findings[0].actual).toBe("1:1");
  });

  it("composites a semi-transparent text fill over its background", () => {
    // Black at 30% over white is #B3B3B3 - about 2:1, a fail. Treating the raw
    // #000000 as the colour would have passed it at 21:1.
    const result = checkHighContrast(
      fixture([
        surface(
          "#FFFFFF",
          text({ fills: [solid("#000000", { opacity: 0.3 })] }),
        ),
      ]),
    );
    expect(result.status).toBe("fail");
    expect(result.findings[0].actual).toBe("2:1");
  });

  it("composites a semi-transparent background over the nearest opaque ancestor", () => {
    // A 50% white scrim over black resolves to #808080; black text on that is
    // 5.3:1 and passes. Skipping translucent surfaces would have skipped this.
    const result = checkHighContrast(
      fixture([
        node({
          name: "page",
          fills: [solid("#000000")],
          children: [
            node({
              name: "scrim",
              fills: [solid("#FFFFFF", { opacity: 0.5 })],
              children: [text({ fills: [solid("#000000")] })],
            }),
          ],
        }),
      ]),
    );
    expect(result.status).toBe("pass");
  });

  it("treats node opacity on the text like paint opacity on its fill", () => {
    // 30% node opacity over an opaque fill is the same surface as a 30% fill,
    // so it must reach the same ratio as the previous case.
    const result = checkHighContrast(
      fixture([
        surface("#FFFFFF", text({ opacity: 0.3, fills: [solid("#000000")] })),
      ]),
    );
    expect(result.status).toBe("fail");
    expect(result.findings[0].actual).toBe("2:1");
  });

  it("treats a wrapper's opacity as a group property, not a per-layer one", () => {
    // Figma fades a frame's fill and its children together, as one composite.
    // A 50% frame holding black text on a white fill, over a black page,
    // therefore renders black text (black at 50% over black is still black) on
    // #808080 - 5.3:1, a pass.
    //
    // Applying the 50% to the text and to the already-flattened background
    // separately double-counts it: that gives #404040 on #808080, 2.6:1, and
    // fails a component that is genuinely fine. Any DS that fades a whole
    // surface would collect invented failures.
    const result = checkHighContrast(
      fixture([
        node({
          name: "page",
          fills: [solid("#000000")],
          children: [
            node({
              name: "scrim",
              opacity: 0.5,
              fills: [solid("#FFFFFF")],
              children: [text({ fills: [solid("#000000")] })],
            }),
          ],
        }),
      ]),
    );
    expect(result.status).toBe("pass");
  });

  it("keeps fading past an opaque surface when an outer group is translucent", () => {
    // White text on an opaque black surface is 21:1 in isolation - but the 50%
    // wrapper composites that whole surface over the white page, so what renders
    // is white on #808080: 3.9:1, a fail.
    //
    // Stopping the walk as soon as the surface turns opaque reports the 21:1 and
    // passes it. Reaching opacity is not the end of the chain.
    const result = checkHighContrast(
      fixture([
        node({
          name: "page",
          fills: [solid("#FFFFFF")],
          children: [
            node({
              name: "wrapper",
              opacity: 0.5,
              children: [
                node({
                  name: "surface",
                  fills: [solid("#000000")],
                  children: [text({ fills: [solid("#FFFFFF")] })],
                }),
              ],
            }),
          ],
        }),
      ]),
    );
    expect(result.status).toBe("fail");
    expect(result.findings[0].actual).toBe("3.9:1");
    // The pair is a composite, so it is named by the colour on screen rather
    // than by the black token that is no longer what renders.
    expect(result.findings[0].message).toContain("#808080");
  });

  it("still needs an opaque backdrop behind a translucent group", () => {
    // Same 50% wrapper, but nothing opaque behind it: the pair genuinely
    // depends on the page colour, which the check refuses to guess.
    const result = checkHighContrast(
      fixture([
        node({
          name: "scrim",
          opacity: 0.5,
          fills: [solid("#FFFFFF")],
          children: [text({ fills: [solid("#000000")] })],
        }),
      ]),
    );
    expect(result.status).toBe("warn");
    expect(messages(result)).toEqual([
      "1 text layer was not evaluated for contrast: 1 had no opaque background behind it.",
    ]);
  });

  it("does not evaluate text whose background never reaches opacity", () => {
    const result = checkHighContrast(
      fixture([
        node({
          name: "transparent wrapper",
          children: [text({ fills: [solid("#999999")] })],
        }),
      ]),
    );
    expect(result.status).toBe("warn");
    expect(messages(result)).toEqual([
      "1 text layer was not evaluated for contrast: 1 had no opaque background behind it.",
    ]);
    expect(result.findings[0].severity).toBe("low");
    expect(result.findings[0].count).toBe(1);
  });

  it("never assumes a white page behind a transparent chain", () => {
    // #999999 would fail against white. Reporting nothing is the point: the
    // check must not invent the background it was not given.
    const result = checkHighContrast(
      fixture([node({ children: [text({ fills: [solid("#999999")] })] })]),
    );
    expect(result.findings.every((f) => f.severity === "low")).toBe(true);
  });

  it("does not evaluate text with per-character fills", () => {
    const result = checkHighContrast(
      fixture([
        surface("#FFFFFF", text({ fillsMixed: true, fills: undefined })),
      ]),
    );
    expect(result.status).toBe("warn");
    expect(messages(result)).toEqual([
      "1 text layer was not evaluated for contrast: 1 uses per-character fills.",
    ]);
  });

  it("rolls every skip reason into one counted finding", () => {
    const result = checkHighContrast(
      fixture([
        surface("#FFFFFF", text({ fillsMixed: true, fills: undefined })),
        surface("#FFFFFF", text({ fillsMixed: true, fills: undefined })),
        node({ children: [text({ fills: [solid("#999999")] })] }),
      ]),
    );
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0].count).toBe(3);
    expect(result.findings[0].message).toBe(
      "3 text layers were not evaluated for contrast: 2 use per-character fills, 1 had no opaque background behind it.",
    );
  });

  it("collapses the same colour pair across variants into one counted finding", () => {
    const failing = () =>
      surface("#FFFFFF", text({ fills: [solid("#999999")] }));
    const result = checkHighContrast(
      fixture([failing(), failing(), failing()]),
    );
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0].count).toBe(3);
  });

  it("never merges distinct colour pairs", () => {
    // State=Disabled legitimately differs from Default, so the two failures
    // are two rows even though they share a background.
    const result = checkHighContrast(
      fixture([
        surface("#FFFFFF", text({ fills: [solid("#999999")] })),
        surface("#FFFFFF", text({ fills: [solid("#AAAAAA")] })),
      ]),
    );
    expect(result.findings).toHaveLength(2);
    expect(result.findings.every((f) => f.count === 1)).toBe(true);
  });

  it("never merges layers that quote the same colour but render differently", () => {
    // Both text layers name #999999, but one is at 50% opacity, so they land at
    // 2.8:1 and 1.6:1. Keying on the quoted colour rather than the rendered one
    // would report a single ratio for two different pairs.
    const result = checkHighContrast(
      fixture([
        node({
          name: "surface",
          fills: [solid("#FFFFFF")],
          children: [
            text({ fills: [solid("#999999")] }),
            text({ opacity: 0.5, fills: [solid("#999999")] }),
          ],
        }),
      ]),
    );
    expect(result.status).toBe("fail");
    expect(result.findings.map((f) => f.actual)).toEqual(["1.6:1", "2.8:1"]);
  });

  it("keeps one row for a rendered pair used at two sizes, judged at the strictest", () => {
    // #BBBBBB on white is 1.9:1 - short of both 4.5:1 and 3:1, so the normal
    // and the large layer both fail on the same rendered pair. That is one
    // colour pair, hence one row, described by the threshold it misses by most.
    const fills = [solid("#BBBBBB")];
    const result = checkHighContrast(
      fixture([
        node({
          name: "surface",
          fills: [solid("#FFFFFF")],
          children: [
            text({ fills, fontSize: 16 }),
            text({ fills, fontSize: 32 }),
          ],
        }),
      ]),
    );
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0].count).toBe(2);
    expect(result.findings[0].expected).toContain("4.5:1");
    expect(result.findings[0].message).toContain("normal text");
  });

  it("reports no text layers at all as not applicable", () => {
    const result = checkHighContrast(
      fixture([node({ fills: [solid("#FFFFFF")] })]),
    );
    expect(result.status).toBe("not_applicable");
    expect(result.findings).toEqual([]);
  });

  it("ignores hidden layers and hidden subtrees", () => {
    const result = checkHighContrast(
      fixture([
        surface("#FFFFFF", text({ visible: false, fills: [solid("#FFFFFF")] })),
        node({
          visible: false,
          fills: [solid("#FFFFFF")],
          children: [text({ fills: [solid("#FFFFFF")] })],
        }),
      ]),
    );
    expect(result.status).toBe("not_applicable");
  });
});

describe("checkHighContrast with theme modes", () => {
  const theme: ThemeSnapshot = {
    collectionId: "c-theme",
    collectionName: "Theme",
    modes: [
      { modeId: "m-core", name: "Core" },
      { modeId: "m-dna", name: "DNA" },
    ],
    variables: {
      "v-text": {
        name: "Text/Muted",
        collectionId: "c-theme",
        byMode: {
          "m-core": { ok: true, type: "COLOR", hex: "#595959", alpha: 1 },
          "m-dna": { ok: true, type: "COLOR", hex: "#999999", alpha: 1 },
        },
      },
      "v-surface": {
        name: "Surface/Default",
        collectionId: "c-theme",
        byMode: {
          "m-core": { ok: true, type: "COLOR", hex: "#FFFFFF", alpha: 1 },
          "m-dna": { ok: true, type: "COLOR", hex: "#FFFFFF", alpha: 1 },
        },
      },
    },
  };

  const boundFixture = () =>
    fixture(
      [
        node({
          name: "surface",
          fills: [solid("#FFFFFF", { boundVariableId: "v-surface" })],
          children: [
            text({ fills: [solid("#595959", { boundVariableId: "v-text" })] }),
          ],
        }),
      ],
      { theme },
    );

  it("fails only in the mode where the pair falls short, naming the mode", () => {
    const result = checkHighContrast(boundFixture());
    expect(result.status).toBe("fail");
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0].message).toContain('in mode "DNA"');
  });

  it("prefers token names over hex when both sides are bound", () => {
    const [finding] = checkHighContrast(boundFixture()).findings;
    expect(finding.message).toContain('"Text/Muted"');
    expect(finding.message).toContain('"Surface/Default"');
    expect(finding.message).not.toContain("#999999");
  });

  it("states which collection and modes it evaluated", () => {
    const result = checkHighContrast(boundFixture());
    expect(result.note).toContain('"Theme"');
    expect(result.note).toContain("Core, DNA");
  });

  it("does not evaluate a layer whose bound colour fails to resolve in a mode", () => {
    const broken: ThemeSnapshot = {
      ...theme,
      variables: {
        ...theme.variables,
        "v-text": {
          name: "Text/Muted",
          collectionId: "c-theme",
          byMode: {
            "m-core": { ok: true, type: "COLOR", hex: "#595959", alpha: 1 },
            "m-dna": { ok: false, reason: "no-value" },
          },
        },
      },
    };
    const result = checkHighContrast({ ...boundFixture(), theme: broken });
    expect(result.status).toBe("warn");
    expect(messages(result)).toEqual([
      "1 text layer was not evaluated for contrast: 1 has a colour that does not resolve in every mode.",
    ]);
  });

  it("resolves colours through a paint style and names it", () => {
    const result = checkHighContrast(
      fixture(
        [
          node({
            name: "surface",
            fillStyleId: "S:bg",
            fills: [solid("#FFFFFF")],
            children: [
              text({ fillStyleId: "S:fg", fills: [solid("#999999")] }),
            ],
          }),
        ],
        {
          colorStyles: {
            "S:bg": { name: "Surface/Card", paints: [solid("#FFFFFF")] },
            "S:fg": { name: "Text/Subtle", paints: [solid("#999999")] },
          },
        },
      ),
    );
    expect(result.status).toBe("fail");
    expect(result.findings[0].message).toContain('"Text/Subtle"');
    expect(result.findings[0].message).toContain('"Surface/Card"');
  });

  it("resolves a variable-bound paint style through the per-mode table", () => {
    const result = checkHighContrast(
      fixture(
        [
          node({
            name: "surface",
            fillStyleId: "S:bg",
            fills: [solid("#FFFFFF")],
            children: [
              text({
                fills: [solid("#595959", { boundVariableId: "v-text" })],
              }),
            ],
          }),
        ],
        {
          theme,
          colorStyles: {
            "S:bg": {
              name: "Surface/Card",
              paints: [solid("#FFFFFF", { boundVariableId: "v-surface" })],
            },
          },
        },
      ),
    );
    expect(result.status).toBe("fail");
    expect(result.findings[0].message).toContain('"Surface/Default"');
  });
});
