import { describe, it, expect } from "vitest";
import { checkHighContrast } from "./high-contrast";
import type {
  ComponentSetSnapshot,
  NodeSnapshot,
  PaintSnapshot,
  TextSegmentSnapshot,
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

/** One styled run of a mixed-colour text layer (#124). */
function run(
  hex: string,
  overrides: Partial<TextSegmentSnapshot> = {},
): TextSegmentSnapshot {
  return { fills: [solid(hex)], fontSize: 16, bold: false, ...overrides };
}

/**
 * A text layer whose fills change mid-sentence. Figma leaves `fills` mixed and
 * `fillStyleId` "MIXED" on such a layer, so the runs are the only description
 * of its colour - the fixture says so rather than leaving it implied.
 */
function mixedText(
  segments: TextSegmentSnapshot[],
  overrides: Partial<NodeSnapshot> = {},
): NodeSnapshot {
  return text({
    fills: undefined,
    fillStyleId: "MIXED",
    fillsMixed: true,
    textSegments: segments,
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

  it("ignores an image behind an opaque surface that completely hides it", () => {
    // The card is opaque, so the hero image behind it changes nothing on screen.
    // Resolving it anyway would report "cannot measure" for a pairing that is
    // perfectly well defined.
    const result = checkHighContrast(
      fixture([
        node({
          name: "hero",
          fills: [{ type: "IMAGE", visible: true, opacity: 1 }],
          children: [
            node({
              name: "card",
              fills: [solid("#FFFFFF")],
              children: [text({ fills: [solid("#999999")] })],
            }),
          ],
        }),
      ]),
    );
    expect(result.status).toBe("fail");
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0].actual).toBe("2.8:1");
  });

  it("does not evaluate text over an image that a translucent surface lets through", () => {
    // Same image, but the card is at 50%, so the image really is part of what
    // renders - and there is no single colour to measure it against.
    const result = checkHighContrast(
      fixture([
        node({
          name: "hero",
          fills: [{ type: "IMAGE", visible: true, opacity: 1 }],
          children: [
            node({
              name: "card",
              opacity: 0.5,
              fills: [solid("#FFFFFF")],
              children: [text({ fills: [solid("#999999")] })],
            }),
          ],
        }),
      ]),
    );
    expect(result.status).toBe("warn");
    expect(messages(result)).toEqual([
      "1 text layer was not evaluated for contrast: 1 has a gradient or image in its colour chain.",
    ]);
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

  it("reports no text layers at all as not applicable, and says why", () => {
    // A not-applicable row carries no findings, so without a note it renders
    // blank and the reader cannot tell it from a broken or skipped check.
    const result = checkHighContrast(
      fixture([node({ fills: [solid("#FFFFFF")] })]),
    );
    expect(result.status).toBe("not_applicable");
    expect(result.findings).toEqual([]);
    expect(result.note).toContain("no text layers of its own");
    expect(result.note).toContain("nested instance");
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

describe("checkHighContrast and disabled variants", () => {
  /** Same failing pair in every variant, with the given variant properties. */
  function withProperties(
    properties: Record<string, string>[],
  ): ComponentSetSnapshot {
    const base = fixture(
      properties.map(() =>
        surface("#FFFFFF", text({ fills: [solid("#999999")] })),
      ),
    );
    return {
      ...base,
      variants: base.variants.map((v, i) => ({
        ...v,
        variantProperties: properties[i],
      })),
    };
  }

  it("does not evaluate a State=Disabled variant", () => {
    // WCAG exempts inactive controls, so a faded disabled state is not a defect
    // and reporting it fills the row with failures nobody can fix.
    const result = checkHighContrast(withProperties([{ State: "Disabled" }]));
    expect(result.status).toBe("not_applicable");
    expect(result.note).toContain("variant here is a disabled state");
  });

  it("does not evaluate a Disabled=True boolean variant", () => {
    const result = checkHighContrast(withProperties([{ Disabled: "True" }]));
    expect(result.status).toBe("not_applicable");
  });

  it("still evaluates a variant whose Disabled boolean is off", () => {
    const result = checkHighContrast(withProperties([{ Disabled: "False" }]));
    expect(result.status).toBe("fail");
  });

  it("evaluates the active variants and counts the disabled ones in the caveat", () => {
    const result = checkHighContrast(
      withProperties([
        { State: "Default" },
        { State: "Disabled" },
        { State: "Disabled" },
      ]),
    );
    expect(result.status).toBe("fail");
    // One failing layer, not three: the two disabled variants never ran.
    expect(result.findings[0].count).toBe(1);
    expect(result.note).toContain("2 disabled variants were not evaluated");
    // The convention this depends on is stated rather than assumed silently.
    expect(result.note).toContain('"Disabled" variant property');
  });

  it("says nothing about disabled variants when there are none", () => {
    const result = checkHighContrast(withProperties([{ State: "Default" }]));
    expect(result.note).not.toContain("disabled");
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

  // What lets a canvas sample be drawn in the mode that fails (#173). Without the
  // mode as data the picture renders in whatever the page resolves, which here
  // would be Core - where this pair passes - so it would contradict the finding.
  describe("the failing mode and affected variants (#173)", () => {
    it("carries the failing mode as data, not only in the message", () => {
      const [finding] = checkHighContrast(boundFixture()).findings;
      expect(finding.modeId).toBe("m-dna");
      expect(finding.modeName).toBe("DNA");
    });

    it("names the variants holding the failing layers", () => {
      const [finding] = checkHighContrast(boundFixture()).findings;
      expect(finding.affectedVariantIds).toEqual(["v:0"]);
      expect(finding.affectedVariantCount).toBe(1);
    });

    // The distinction the two fields exist for: `count` counts *layers*, and two
    // layers in one variant must not read as two affected variants.
    it("counts variants, not layers, when one variant holds two failing layers", () => {
      const twoLayers = fixture(
        [
          node({
            name: "surface",
            fills: [solid("#FFFFFF", { boundVariableId: "v-surface" })],
            children: [
              text({
                name: "label",
                fills: [solid("#595959", { boundVariableId: "v-text" })],
              }),
              text({
                name: "helper",
                fills: [solid("#595959", { boundVariableId: "v-text" })],
              }),
            ],
          }),
        ],
        { theme },
      );

      const [finding] = checkHighContrast(twoLayers).findings;
      expect(finding.count).toBe(2);
      expect(finding.affectedVariantCount).toBe(1);
      expect(finding.affectedVariantIds).toEqual(["v:0"]);
    });

    it("collects every variant when the pair fails across several", () => {
      const failing = () =>
        node({
          name: "surface",
          fills: [solid("#FFFFFF", { boundVariableId: "v-surface" })],
          children: [
            text({ fills: [solid("#595959", { boundVariableId: "v-text" })] }),
          ],
        });

      const [finding] = checkHighContrast(
        fixture([failing(), failing(), failing()], { theme }),
      ).findings;
      expect(finding.affectedVariantIds).toEqual(["v:0", "v:1", "v:2"]);
      expect(finding.affectedVariantCount).toBe(3);
    });

    // A set painted in literal hex has no theme table, so `evaluatedModes` falls
    // back to one anonymous mode. Declaring that as a pinnable mode would claim a
    // pin that means nothing.
    it("declares no mode for a set with no theme", () => {
      const [finding] = checkHighContrast(
        fixture([surface("#FFFFFF", text({ fills: [solid("#999999")] }))]),
      ).findings;
      expect(finding.modeId).toBeUndefined();
      expect(finding.modeName).toBeUndefined();
      expect(finding.affectedVariantIds).toEqual(["v:0"]);
    });
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

  it("resolves a styled run's bound variable per mode, like any other fill", () => {
    // The link run is the same token that fails in DNA and passes in Core; the
    // surrounding body copy is fine in both. A run resolves through exactly the
    // rules a whole layer does, so only DNA is reported - and by token name.
    const result = checkHighContrast(
      fixture(
        [
          node({
            name: "surface",
            fills: [solid("#FFFFFF", { boundVariableId: "v-surface" })],
            children: [
              mixedText([
                run("#111111"),
                run("#595959", {
                  fills: [solid("#595959", { boundVariableId: "v-text" })],
                }),
              ]),
            ],
          }),
        ],
        { theme },
      ),
    );
    expect(result.status).toBe("fail");
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0].message).toContain('in mode "DNA"');
    expect(result.findings[0].message).toContain('"Text/Muted"');
    expect(result.findings[0].message).toContain('"Surface/Default"');
  });
});

/**
 * Text whose colour changes mid-sentence (issue #124): a coloured link inside a
 * paragraph, or a highlighted word. Before this, the whole layer was skipped -
 * the one shape of text that most often carries a low-contrast link was the one
 * shape the check could not see.
 */
describe("checkHighContrast on mixed-colour text", () => {
  it("measures a failing run that the layer as a whole would have hidden", () => {
    const result = checkHighContrast(
      fixture([
        surface("#FFFFFF", mixedText([run("#111111"), run("#999999")])),
      ]),
    );
    expect(result.status).toBe("fail");
    expect(messages(result)).toEqual([
      "Text #999999 on #FFFFFF is 2.8:1, below the WCAG AA minimum for normal text.",
    ]);
  });

  it("leaves a layer alone when every run clears AA", () => {
    const result = checkHighContrast(
      fixture([
        surface("#FFFFFF", mixedText([run("#111111"), run("#595959")])),
      ]),
    );
    expect(result.status).toBe("pass");
    expect(result.findings).toEqual([]);
  });

  it("counts a layer once however many of its runs share a pair", () => {
    // Four grey runs in one paragraph are one defect and one token pair to fix.
    // Counting runs would report "4 occurrences" of a mistake made once.
    const result = checkHighContrast(
      fixture([
        surface(
          "#FFFFFF",
          mixedText([
            run("#999999"),
            run("#111111"),
            run("#999999"),
            run("#999999"),
            run("#999999"),
          ]),
        ),
      ]),
    );
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0].count).toBe(1);
  });

  it("still counts one per layer when several layers share the pair", () => {
    const paragraph = () =>
      surface("#FFFFFF", mixedText([run("#999999"), run("#999999")]));
    const result = checkHighContrast(
      fixture([paragraph(), paragraph(), paragraph()]),
    );
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0].count).toBe(3);
  });

  it("reports runs that fail on genuinely different pairs separately", () => {
    // Two colours are two fixes, so merging them would hide one behind the
    // other - the same reason distinct pairs are never merged across layers.
    const result = checkHighContrast(
      fixture([
        surface("#FFFFFF", mixedText([run("#999999"), run("#AAAAAA")])),
      ]),
    );
    expect(result.findings).toHaveLength(2);
    expect(messages(result).join(" ")).toContain("#999999");
    expect(messages(result).join(" ")).toContain("#AAAAAA");
    expect(result.findings.every((f) => f.count === 1)).toBe(true);
  });

  it("judges each run at its own size, not at the layer's smallest", () => {
    // #949494 is ~3.1:1 - over AA large, under AA normal. The 24px run is
    // compliant; judging it at the layer's smallest size would invent a
    // failure on text that is perfectly readable.
    const result = checkHighContrast(
      fixture([
        surface(
          "#FFFFFF",
          mixedText([run("#949494", { fontSize: 24 }), run("#333333")], {
            fontSize: 16,
          }),
        ),
      ]),
    );
    expect(result.status).toBe("pass");
    expect(result.findings).toEqual([]);
  });

  it("describes a pair failing at two sizes by its strictest threshold", () => {
    // #999999 is under both thresholds, so both runs fail - at 3:1 for the
    // heading and 4.5:1 for the caption. One pair is one row, described by the
    // stricter of the two, exactly as it is when two layers share a pair.
    const result = checkHighContrast(
      fixture([
        surface(
          "#FFFFFF",
          mixedText([run("#999999", { fontSize: 24 }), run("#999999")]),
        ),
      ]),
    );
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0].expected).toContain("4.5:1");
    expect(result.findings[0].expected).toContain("normal text");
    expect(result.findings[0].count).toBe(1);
  });

  it("applies the large-text threshold to a bold run on its own merit", () => {
    const result = checkHighContrast(
      fixture([
        surface(
          "#FFFFFF",
          mixedText([
            run("#949494", { fontSize: 18.66, bold: true }),
            run("#333333"),
          ]),
        ),
      ]),
    );
    expect(result.status).toBe("pass");
  });

  it("resolves a run through the paint style it carries, and names it", () => {
    // The layer's own `fillStyleId` is "MIXED" and says nothing; the run's does.
    const result = checkHighContrast(
      fixture(
        [
          node({
            name: "surface",
            fillStyleId: "S:bg",
            fills: [solid("#FFFFFF")],
            children: [
              mixedText([
                run("#111111"),
                run("#999999", { fillStyleId: "S:link" }),
              ]),
            ],
          }),
        ],
        {
          colorStyles: {
            "S:bg": { name: "Surface/Card", paints: [solid("#FFFFFF")] },
            "S:link": { name: "Text/Link", paints: [solid("#999999")] },
          },
        },
      ),
    );
    expect(result.status).toBe("fail");
    expect(result.findings[0].message).toContain('"Text/Link"');
    expect(result.findings[0].message).toContain('"Surface/Card"');
  });

  it("measures the runs it can when one of them has no single colour", () => {
    // A gradient run has no colour to measure, but that is no reason to stop
    // measuring the run beside it. The layer still lands in the skipped tally,
    // so the unmeasured part is never quietly green.
    const result = checkHighContrast(
      fixture([
        surface(
          "#FFFFFF",
          mixedText([
            run("#999999"),
            run("#000000", {
              fills: [{ type: "GRADIENT_LINEAR", visible: true, opacity: 1 }],
            }),
          ]),
        ),
      ]),
    );
    expect(result.status).toBe("fail");
    expect(messages(result)).toEqual([
      "Text #999999 on #FFFFFF is 2.8:1, below the WCAG AA minimum for normal text.",
      "1 text layer was not evaluated for contrast: 1 has a gradient or image in its colour chain.",
    ]);
  });

  it("fades every run of a translucent layer alike", () => {
    // 50% black over white renders #808080 - 3.9:1, a fail for normal text.
    // The layer's opacity is a property of the layer, not of any one run.
    const result = checkHighContrast(
      fixture([
        surface(
          "#FFFFFF",
          mixedText([run("#000000"), run("#000000")], { opacity: 0.5 }),
        ),
      ]),
    );
    expect(result.status).toBe("fail");
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0].count).toBe(1);
    expect(result.findings[0].actual).toBe("3.9:1");
  });

  it("still declines a layer that claims mixed fills but carries no runs", () => {
    // Nothing to measure and nothing to guess from: the honest answer is that
    // the layer was not evaluated, which is what it was before #124 too.
    const result = checkHighContrast(
      fixture([surface("#FFFFFF", mixedText([]))]),
    );
    expect(result.status).toBe("warn");
    expect(messages(result)).toEqual([
      "1 text layer was not evaluated for contrast: 1 uses per-character fills.",
    ]);
  });

  it("says in the note that runs are measured and counted per layer", () => {
    const result = checkHighContrast(
      fixture([surface("#FFFFFF", mixedText([run("#111111")]))]),
    );
    expect(result.note).toContain("per styled run");
  });
});
