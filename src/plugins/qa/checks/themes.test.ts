import { describe, it, expect } from "vitest";
import { checkThemes } from "./themes";
import type {
  ComponentSetSnapshot,
  NodeSnapshot,
  ThemeSnapshot,
  VariableResolutionSnapshot,
} from "../snapshot";

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

/**
 * A variable resolving cleanly in every listed mode, to a *different* colour in
 * each - which is what a themed token actually does. Resolving to one colour
 * everywhere is its own finding (see `invariant`), so the default fixture must
 * not quietly be that case.
 */
function resolved(
  name: string,
  modeIds: string[],
  collectionId = "c-theme",
): VariableResolutionSnapshot {
  return {
    name,
    collectionId,
    byMode: Object.fromEntries(
      modeIds.map((m, i) => [
        m,
        { ok: true, type: "COLOR", hex: `#${String(i + 1).repeat(6)}` },
      ]),
    ),
  };
}

/** A variable resolving to the same colour in every mode. */
function invariant(
  name: string,
  modeIds: string[],
  collectionId = "c-theme",
): VariableResolutionSnapshot {
  return {
    name,
    collectionId,
    byMode: Object.fromEntries(
      modeIds.map((m) => [m, { ok: true, type: "COLOR", hex: "#123456" }]),
    ),
  };
}

const THEME_MODES = [
  { modeId: "m-core", name: "Core" },
  { modeId: "m-dna", name: "DNA" },
];

function theme(overrides: Partial<ThemeSnapshot> = {}): ThemeSnapshot {
  return {
    collectionId: "c-theme",
    collectionName: "Theme",
    modes: THEME_MODES,
    variables: {},
    ...overrides,
  };
}

function fixture(
  trees: NodeSnapshot[][],
  themeSnapshot?: ThemeSnapshot,
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
    ...(themeSnapshot ? { theme: themeSnapshot } : {}),
  };
}

/** A node consuming `variableId` through a fill. */
function filled(variableId: string, name = "bg"): NodeSnapshot {
  return node({
    name,
    fills: [
      {
        type: "SOLID",
        visible: true,
        opacity: 1,
        hex: "#123456",
        boundVariableId: variableId,
      },
    ],
  });
}

describe("checkThemes", () => {
  it("is not_applicable when the probe produced no theme table", () => {
    const result = checkThemes(fixture([[node()]]));
    expect(result.checkId).toBe("themes");
    expect(result.status).toBe("not_applicable");
    expect(result.findings).toEqual([]);
    // "No theme axis" and "could not check" are materially different
    // statements to a designer, so the three n/a causes are distinguished
    // rather than sharing one string (#129).
    expect(result.note).toContain("No theme collection could be determined");
  });

  it("passes when every used variable resolves in every mode, and says what it evaluated", () => {
    const result = checkThemes(
      fixture(
        [[filled("v-bg")]],
        theme({
          variables: { "v-bg": resolved("bg/default", ["m-core", "m-dna"]) },
        }),
      ),
    );
    expect(result.status).toBe("pass");
    expect(result.findings).toEqual([]);
    // The collection pick is a heuristic, so a wrong pick has to be visible
    // rather than silently producing green rows.
    expect(result.note).toContain("Theme");
    expect(result.note).toContain("Core");
    expect(result.note).toContain("DNA");
  });

  it("fails a variable with no value for one mode, naming the variable and the mode", () => {
    const result = checkThemes(
      fixture(
        [[filled("v-bg")]],
        theme({
          variables: {
            "v-bg": {
              name: "bg/default",
              collectionId: "c-theme",
              byMode: {
                "m-core": { ok: true, type: "COLOR", hex: "#FFFFFF" },
                "m-dna": { ok: false, reason: "no-value" },
              },
            },
          },
        }),
      ),
    );
    expect(result.status).toBe("fail");
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0].message).toContain("bg/default");
    expect(result.findings[0].message).toContain("DNA");
    expect(result.findings[0].message).toMatch(/no value/i);
  });

  it("fails an unresolvable alias chain, distinguishing it from a missing value", () => {
    const result = checkThemes(
      fixture(
        [[filled("v-fg")]],
        theme({
          variables: {
            "v-fg": {
              name: "fg/muted",
              collectionId: "c-semantic",
              byMode: {
                "m-core": { ok: true, type: "COLOR", hex: "#000000" },
                "m-dna": { ok: false, reason: "unresolved-alias" },
              },
            },
          },
        }),
      ),
    );
    expect(result.status).toBe("fail");
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0].message).toMatch(/alias/i);
    expect(result.findings[0].message).toContain("fg/muted");
    expect(result.findings[0].message).toContain("DNA");
  });

  it("emits one finding per variable × mode, not per consuming node", () => {
    // Same variable broken in both modes, consumed by three layers across two
    // variants: two findings (one per mode), each counting three usages.
    const broken: VariableResolutionSnapshot = {
      name: "bg/default",
      collectionId: "c-theme",
      byMode: {
        "m-core": { ok: false, reason: "no-value" },
        "m-dna": { ok: false, reason: "no-value" },
      },
    };
    const result = checkThemes(
      fixture(
        [[filled("v-bg", "a"), filled("v-bg", "b")], [filled("v-bg", "c")]],
        theme({ variables: { "v-bg": broken } }),
      ),
    );
    expect(result.findings).toHaveLength(2);
    expect(result.findings.map((f) => f.count)).toEqual([3, 3]);
    const modes = result.findings.map((f) => f.message);
    expect(modes.some((m) => m.includes("Core"))).toBe(true);
    expect(modes.some((m) => m.includes("DNA"))).toBe(true);
  });

  it("counts usages bound on node fields, not just paints", () => {
    const result = checkThemes(
      fixture(
        [
          [
            node({ name: "row", boundVariableIds: ["v-gap"] }),
            node({ name: "row2", boundVariableIds: ["v-gap"] }),
          ],
        ],
        theme({
          variables: {
            "v-gap": {
              name: "space/200",
              collectionId: "c-theme",
              byMode: {
                "m-core": { ok: true, type: "FLOAT" },
                "m-dna": { ok: false, reason: "no-value" },
              },
            },
          },
        }),
      ),
    );
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0].count).toBe(2);
  });

  it("reports nothing to judge when the table holds no variable the set binds", () => {
    // The probe may resolve a variable that only a style references; without a
    // usage in this set there is nothing to report against.
    const result = checkThemes(
      fixture(
        [[node()]],
        theme({
          variables: {
            "v-unused": {
              name: "bg/legacy",
              collectionId: "c-theme",
              byMode: {
                "m-core": { ok: true, type: "COLOR" },
                "m-dna": { ok: false, reason: "no-value" },
              },
            },
          },
        }),
      ),
    );
    // The probe also resolves variables reached only through a shared fill
    // style (for #16), so an unused entry must not be judged - and must not
    // produce a `pass` either, which would claim a verification that never
    // happened.
    expect(result.status).toBe("not_applicable");
    expect(result.findings).toEqual([]);
    expect(result.note).toContain("binds nothing from the theme collection");
    expect(result.note).toContain("shared styles");
  });

  it("does not blame the mode count when the set binds nothing at all", () => {
    // A style-only set has its collection picked from the style's variables, so
    // that collection can perfectly well have one mode. Reporting "the
    // collection this set binds has only one mode" would then assert a binding
    // that does not exist, which is the failure #129 is about.
    const result = checkThemes(
      fixture(
        [[node()]],
        theme({
          modes: [{ modeId: "m-only", name: "Value" }],
          variables: { "v-unused": resolved("bg/legacy", ["m-only"]) },
        }),
      ),
    );
    expect(result.status).toBe("not_applicable");
    expect(result.note).not.toContain("only one mode");
    expect(result.note).toContain("binds nothing from the theme collection");
  });

  it("warns when a layer pins its own mode for the theme collection", () => {
    const result = checkThemes(
      fixture(
        [
          [
            filled("v-bg"),
            node({
              id: "1:9",
              name: "pinned",
              explicitVariableModes: { "c-theme": "m-core" },
            }),
          ],
        ],
        theme({
          variables: { "v-bg": resolved("bg/default", ["m-core", "m-dna"]) },
        }),
      ),
    );
    expect(result.status).toBe("warn");
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0].message).toMatch(/explicit mode/i);
    expect(result.findings[0].nodeId).toBe("1:9");
  });

  it("ignores a layer pinning some other collection's mode", () => {
    // A density or rem/px pin says nothing about whether the theme resolved,
    // so raising the caveat for it would flag verifiable components.
    const result = checkThemes(
      fixture(
        [
          [
            filled("v-bg"),
            node({
              name: "compact",
              explicitVariableModes: { "c-density": "m-compact" },
            }),
          ],
        ],
        theme({
          variables: { "v-bg": resolved("bg/default", ["m-core", "m-dna"]) },
        }),
      ),
    );
    expect(result.status).toBe("pass");
    expect(result.findings).toEqual([]);
  });

  it("still fails, not warns, when overrides coexist with a real resolution failure", () => {
    const result = checkThemes(
      fixture(
        [
          [
            filled("v-bg"),
            node({
              name: "pinned",
              explicitVariableModes: { "c-theme": "m-core" },
            }),
          ],
        ],
        theme({
          variables: {
            "v-bg": {
              name: "bg/default",
              collectionId: "c-theme",
              byMode: {
                "m-core": { ok: true, type: "COLOR" },
                "m-dna": { ok: false, reason: "no-value" },
              },
            },
          },
        }),
      ),
    );
    expect(result.status).toBe("fail");
    // Both the failure and the caveat are reported.
    expect(result.findings).toHaveLength(2);
  });

  it("is not_applicable when the theme collection has only one mode", () => {
    // Nothing to compare across: a single-mode collection is not a theme, and
    // flagging its variables as "not theme-aware" is explicitly out of scope.
    const result = checkThemes(
      fixture(
        [[filled("v-bg")]],
        theme({
          modes: [{ modeId: "m-only", name: "Value" }],
          variables: { "v-bg": resolved("bg/default", ["m-only"]) },
        }),
      ),
    );
    expect(result.status).toBe("not_applicable");
    expect(result.findings).toEqual([]);
    expect(result.note).toContain("only one mode");
  });

  it("fails a binding Figma could not load, rather than dropping it", () => {
    // getVariableByIdAsync returning null is the broken-remote-variable case.
    // Discarding it let a set with one dead binding pass on the strength of its
    // remaining healthy variables.
    const result = checkThemes(
      fixture(
        [[filled("v-dead"), filled("v-ok", "fine")]],
        theme({
          variables: { "v-ok": resolved("bg/default", ["m-core", "m-dna"]) },
          unavailableVariableIds: ["v-dead"],
        }),
      ),
    );
    expect(result.status).toBe("fail");
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0].message).toContain("v-dead");
    expect(result.findings[0].message).toMatch(/could not be loaded/i);
    // The consuming layer, so "jump to offender" still lands somewhere real.
    expect(result.findings[0].nodeName).toBe("bg");
  });

  it("still reports dead bindings when no theme collection could be determined", () => {
    // Every lookup failed, so there is no bound collection to call the theme
    // and no modes to evaluate. The dead bindings are the whole story.
    const result = checkThemes(
      fixture(
        [[filled("v-dead")]],
        theme({
          collectionId: undefined,
          collectionName: undefined,
          modes: [],
          unavailableVariableIds: ["v-dead"],
        }),
      ),
    );
    expect(result.status).toBe("fail");
    expect(result.findings).toHaveLength(1);
    expect(result.note).toMatch(/no theme collection could be determined/i);
  });

  describe("visual remainder (#115)", () => {
    function passing() {
      return checkThemes(
        fixture(
          [[filled("v-bg")]],
          theme({
            variables: { "v-bg": resolved("bg/default", ["m-core", "m-dna"]) },
          }),
        ),
      );
    }

    it("leaves the visual review outstanding, naming the modes to look at", () => {
      // The ask was "see that it works and looks good in all modes"; this check
      // only proves every bound variable resolves. A green chip that stood for
      // the look would be a false pass.
      const remainder = passing().manualRemainder;
      expect(remainder).toBeDefined();
      // Named, not "check the modes", so the tick is actionable.
      expect(remainder).toContain("Core");
      expect(remainder).toContain("DNA");
    });

    it("keeps the remainder on warn and fail, not just pass", () => {
      const failing = checkThemes(
        fixture(
          [[filled("v-bg")]],
          theme({
            variables: {
              "v-bg": {
                name: "bg/default",
                collectionId: "c-theme",
                byMode: {
                  "m-core": { ok: true, type: "COLOR", hex: "#123456" },
                  "m-dna": { ok: false, reason: "no-value" },
                },
              },
            },
          }),
        ),
      );
      expect(failing.status).toBe("fail");
      expect(failing.manualRemainder).toContain("Core");
    });

    it("omits the remainder when there is no theme to look at", () => {
      // `not_applicable` means no theme collection, a single-mode collection, or
      // nothing this set binds is theme-aware. In all three the component renders
      // identically in every mode, so there is nothing to compare by eye -
      // unlike #7's remainder, which is owed even on `not_applicable`.
      const noTheme = checkThemes(fixture([[node()]]));
      expect(noTheme.status).toBe("not_applicable");
      expect(noTheme.manualRemainder).toBeUndefined();

      const singleMode = checkThemes(
        fixture(
          [[filled("v-bg")]],
          theme({
            modes: [{ modeId: "m-only", name: "Only" }],
            variables: { "v-bg": resolved("bg/default", ["m-only"]) },
          }),
        ),
      );
      expect(singleMode.status).toBe("not_applicable");
      expect(singleMode.manualRemainder).toBeUndefined();
    });

    it("still asks for a look when the modes could not be determined", () => {
      // Every binding is dead, so there are no mode names to offer - but a set
      // with broken bindings is exactly one a human should see rendered.
      const result = checkThemes(
        fixture(
          [[filled("v-dead")]],
          theme({
            collectionId: undefined,
            collectionName: undefined,
            modes: [],
            unavailableVariableIds: ["v-dead"],
          }),
        ),
      );
      expect(result.manualRemainder).toBeDefined();
      expect(result.manualRemainder).toMatch(/mode/i);
    });
  });

  it("orders findings deterministically by message", () => {
    const result = checkThemes(
      fixture(
        [[filled("v-b"), filled("v-a")]],
        theme({
          variables: {
            "v-b": {
              name: "zeta",
              collectionId: "c-theme",
              byMode: {
                "m-core": { ok: false, reason: "no-value" },
                "m-dna": { ok: true },
              },
            },
            "v-a": {
              name: "alpha",
              collectionId: "c-theme",
              byMode: {
                "m-core": { ok: false, reason: "no-value" },
                "m-dna": { ok: true },
              },
            },
          },
        }),
      ),
    );
    const messages = result.findings.map((f) => f.message);
    expect(messages).toEqual([...messages].sort());
  });
});

describe("checkThemes - a set that renders the same in every mode", () => {
  const modeIds = THEME_MODES.map((m) => m.modeId);

  // Resolution integrity is a weaker claim than it looks: every variable can
  // resolve perfectly while resolving to the *same* value everywhere, and then
  // the component is provably identical in every mode. Two real sets showed this
  // - four brand modes, pixel-identical - while the row reported pass.
  it("warns when every bound colour resolves to one value in all modes", () => {
    const snapshot = fixture(
      [[filled("v-bg")]],
      theme({ variables: { "v-bg": invariant("bg/surface", modeIds) } }),
    );

    const result = checkThemes(snapshot);

    expect(result.status).toBe("warn");
    const messages = result.findings.map((f) => f.message);
    expect(messages.some((m) => /same value in all/i.test(m))).toBe(true);
    expect(messages.some((m) => /renders identically/i.test(m))).toBe(true);
  });

  it("stays a pass when at least one bound colour differs between modes", () => {
    const snapshot = fixture(
      [[filled("v-bg")]],
      theme({ variables: { "v-bg": resolved("bg/surface", modeIds) } }),
    );

    expect(checkThemes(snapshot).status).toBe("pass");
  });

  // The probe records a value only for colours, so a set binding only spacing or
  // number tokens cannot be judged this way - and guessing from data we do not
  // have is how a check earns its false-positive reputation.
  it("says nothing when no bound variable is a colour", () => {
    const spacing: VariableResolutionSnapshot = {
      name: "space/md",
      collectionId: "c-theme",
      byMode: Object.fromEntries(
        modeIds.map((m) => [m, { ok: true, type: "FLOAT" }]),
      ),
    };
    const snapshot = fixture(
      [[filled("v-space")]],
      theme({ variables: { "v-space": spacing } }),
    );

    const result = checkThemes(snapshot);

    expect(result.status).toBe("pass");
    expect(result.findings.map((f) => f.message)).not.toContainEqual(
      expect.stringMatching(/renders identically/i),
    );
  });
});
