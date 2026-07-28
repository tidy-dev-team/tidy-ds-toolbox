import { describe, it, expect } from "vitest";
import { checkAssetProvenance } from "./asset-provenance";
import type { AssetManifest } from "../asset-manifest";
import type { ComponentSetSnapshot, NodeSnapshot } from "../snapshot";

let seq = 0;

function node(overrides: Partial<NodeSnapshot>): NodeSnapshot {
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

/** A nested instance pointing at a resolvable main component. */
function instance(
  name: string,
  main: Omit<NonNullable<NodeSnapshot["mainComponent"]>, "id">,
  overrides: Partial<NodeSnapshot> = {},
): NodeSnapshot {
  return node({
    name,
    type: "INSTANCE",
    mainComponent: { id: `main-${main.key}`, ...main },
    ...overrides,
  });
}

const REMOTE_ICON = { key: "abc123", name: "Icon/check", remote: true };
const LOCAL_ICON = { key: "def456", name: "ic-arrow", remote: false };

function fixture(
  children: NodeSnapshot[][],
  name = "Button",
): ComponentSetSnapshot {
  return {
    id: "1:0",
    name,
    type: "COMPONENT_SET",
    description: "",
    propertyNames: [],
    properties: [],
    variants: children.map((kids, i) => ({
      id: `v:${i}`,
      name: `${name}-${i}`,
      variantProperties: {},
      tree: node({
        id: `v:${i}`,
        name: `${name}-${i}`,
        type: "COMPONENT",
        children: kids,
      }),
    })),
  };
}

describe("checkAssetProvenance", () => {
  it("passes a component whose only nested instance is remote, and says origin is unverifiable", () => {
    const result = checkAssetProvenance(
      fixture([
        [node({ name: "label", type: "TEXT" }), instance("ic", REMOTE_ICON)],
      ]),
    );
    expect(result.checkId).toBe("asset-provenance");
    expect(result.status).toBe("pass");
    expect(result.findings).toEqual([]);
    // The caveat is part of the result, not a comment in the source.
    expect(result.note).toMatch(/origin/i);
    expect(result.note).toMatch(/cannot be verified/i);
  });

  it("fails raw vector geometry sitting alongside other content", () => {
    const result = checkAssetProvenance(
      fixture([
        [
          node({ name: "label", type: "TEXT" }),
          node({ name: "Vector 12", type: "VECTOR" }),
        ],
      ]),
    );
    expect(result.status).toBe("fail");
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0].message).toMatch(/raw vector/i);
    expect(result.findings[0].nodeName).toBe("Vector 12");
  });

  it("warns, not fails, on a nested instance whose main component is local", () => {
    // Indistinguishable from a component legitimately built out of private
    // sub-components in its own file, so the check surfaces it and leaves the
    // call to the designer rather than asserting a defect.
    const result = checkAssetProvenance(
      fixture([
        [node({ name: "label", type: "TEXT" }), instance("ic", LOCAL_ICON)],
      ]),
    );
    expect(result.status).toBe("warn");
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0].severity).toBe("medium");
    expect(result.findings[0].message).toMatch(
      /in this file rather than a library/i,
    );
    // The message names the main component, not the layer — the count spans
    // usage sites with different layer names.
    expect(result.findings[0].message).toContain("ic-arrow");
    expect(result.findings[0].nodeName).toBe("ic");
    expect(result.findings[0].count).toBe(1);
  });

  it("is not_applicable for a vector-only leaf tree — the component IS the asset", () => {
    // Kido shape: COMPONENT > frame "ic" > VECTOR. The frame is a container,
    // not a leaf, so the structural rule exempts it without knowing the name.
    const result = checkAssetProvenance(
      fixture(
        [
          [
            node({
              name: "ic",
              children: [node({ name: "Vector", type: "VECTOR" })],
            }),
          ],
        ],
        "IconCheck",
      ),
    );
    expect(result.status).toBe("not_applicable");
    expect(result.findings).toEqual([]);
    // The #101 structural exemption is the engine's most interesting
    // judgment on an icon set, so the row must not read as a bare n/a (#129).
    expect(result.note).toContain("Every variant is the asset artwork itself");
  });

  it("judges the exemption per variant, so one odd variant doesn't fail the whole icon set", () => {
    // Three vector-only variants plus one carrying a stray text label. Pooling
    // the leaf tally across the set would un-exempt everything and then fail
    // every vector in the icon — exactly the false positive the exemption is for.
    const iconVariant = () => [
      node({
        name: "ic",
        children: [node({ name: "Vector", type: "VECTOR" })],
      }),
    ];
    const result = checkAssetProvenance(
      fixture(
        [
          iconVariant(),
          iconVariant(),
          iconVariant(),
          [
            node({
              name: "ic",
              children: [node({ name: "Vector", type: "VECTOR" })],
            }),
            node({ name: "label", type: "TEXT" }),
          ],
        ],
        "IconCheck",
      ),
    );
    // Only the odd variant is scanned, so its own vector is the lone finding —
    // not one per variant across the set.
    expect(result.status).toBe("fail");
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0].count).toBe(1);
  });

  it("still exempts an asset variant that contains an empty container frame", () => {
    // A clip frame or spacer holds nothing. Treating it as a non-geometry leaf
    // un-exempted the variant and then failed every vector inside it.
    const result = checkAssetProvenance(
      fixture(
        [
          [
            node({ name: "clip" }),
            node({
              name: "ic",
              children: [node({ name: "Vector", type: "VECTOR" })],
            }),
          ],
        ],
        "IconCheck",
      ),
    );
    expect(result.status).toBe("not_applicable");
    expect(result.findings).toEqual([]);
    expect(result.note).toContain("Every variant is the asset artwork itself");
  });

  it("does not fail a drawn divider LINE, but still counts it as artwork", () => {
    // A LINE is the divider primitive, exactly like RECTANGLE — flagging it
    // would fail ordinary cards. Inside a real component: not a finding.
    const inComponent = checkAssetProvenance(
      fixture([
        [
          node({ name: "label", type: "TEXT" }),
          node({ name: "rule", type: "LINE" }),
        ],
      ]),
    );
    expect(inComponent.status).toBe("not_applicable");
    expect(inComponent.findings).toEqual([]);
    // A different n/a cause from the asset exemption above, so a different
    // reason.
    expect(inComponent.note).toContain("no nested instances");
    // Deliberately not "no vector geometry": this fixture HAS a LINE. The
    // claim is about provenance-bearing content, not about geometry.
    expect(inComponent.note).not.toContain("no raw vector geometry");

    // Inside a logo built from lines and vectors: still pure artwork, so the
    // asset exemption applies rather than the variant being scanned.
    const asAsset = checkAssetProvenance(
      fixture(
        [
          [
            node({ name: "bar", type: "LINE" }),
            node({ name: "Vector", type: "VECTOR" }),
          ],
        ],
        "Logo",
      ),
    );
    expect(asAsset.status).toBe("not_applicable");
    expect(asAsset.findings).toEqual([]);
  });

  it("names the offending component's owning set, not the variant", () => {
    // An instance's main component is the *variant*, so labelling with its own
    // name reads as "State=Default" — identical across unrelated sets, which
    // both hides which component is at fault and lets the canvas grouping
    // collapse distinct offenders into one row.
    const result = checkAssetProvenance(
      fixture([
        [
          instance("DropdownItem1", {
            key: "k1",
            name: "State=Default",
            setId: "set-1",
            setName: "_elements / DesktopItems",
            remote: false,
          }),
          instance("Person1", {
            key: "k2",
            name: "State=Default",
            setId: "set-2",
            setName: "_elements / PersonSelectorStates",
            remote: false,
          }),
        ],
      ]),
    );

    expect(result.status).toBe("warn");
    expect(result.findings).toHaveLength(2);
    const messages = result.findings.map((f) => f.message);
    expect(messages.some((m) => m.includes("_elements / DesktopItems"))).toBe(
      true,
    );
    expect(
      messages.some((m) => m.includes("_elements / PersonSelectorStates")),
    ).toBe(true);
    // Distinct messages, so grouping can't merge them.
    expect(new Set(messages).size).toBe(2);
  });

  it("reports one finding per offending set even when several of its variants are used", () => {
    const result = checkAssetProvenance(
      fixture([
        [
          instance("item", {
            key: "k-default",
            name: "State=Default",
            setId: "set-1",
            setName: "_elements / DesktopItems",
            remote: false,
          }),
          instance("item", {
            key: "k-hover",
            name: "State=Hover",
            setId: "set-1",
            setName: "_elements / DesktopItems",
            remote: false,
          }),
        ],
      ]),
    );

    expect(result.findings).toHaveLength(1);
    expect(result.findings[0].count).toBe(2);
    expect(result.findings[0].message).toContain("_elements / DesktopItems");
  });

  it("falls back to the component's own name when it has no owning set", () => {
    const result = checkAssetProvenance(
      fixture([
        [instance("ic", { key: "solo", name: "ic-arrow", remote: false })],
      ]),
    );
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0].message).toContain("ic-arrow");
  });

  it("exempts a mixed-geometry illustration (vectors plus primitives)", () => {
    const result = checkAssetProvenance(
      fixture(
        [
          [
            node({ name: "bg", type: "ELLIPSE" }),
            node({ name: "glyph", type: "BOOLEAN_OPERATION" }),
            node({ name: "bar", type: "RECTANGLE" }),
          ],
        ],
        "LogoKido",
      ),
    );
    expect(result.status).toBe("not_applicable");
  });

  it("does not flag primitives used as decoration inside a real component", () => {
    // A rectangle divider is not pasted artwork — only true path geometry
    // (VECTOR / BOOLEAN_OPERATION / STAR / POLYGON / LINE) reads as detached art.
    const result = checkAssetProvenance(
      fixture([
        [
          node({ name: "label", type: "TEXT" }),
          node({ name: "divider", type: "RECTANGLE" }),
          instance("ic", REMOTE_ICON),
        ],
      ]),
    );
    expect(result.status).toBe("pass");
    expect(result.findings).toEqual([]);
  });

  it("is not_applicable when there is nothing to judge — no vectors, no nested instances", () => {
    const result = checkAssetProvenance(
      fixture([[node({ name: "label", type: "TEXT" })]]),
    );
    expect(result.status).toBe("not_applicable");
    expect(result.findings).toEqual([]);
    expect(result.note).toContain("no nested instances");
    // The original point of this assertion still stands: nothing was trusted
    // on the strength of being remote here, so the #8 unverifiable-origin
    // caveat must not leak onto the row. It now carries a reason instead of
    // nothing at all (#129), but never that one.
    expect(result.note).not.toContain("Library origin cannot be verified");
  });

  it("dedupes to one finding per offending main component, with an occurrence count", () => {
    const result = checkAssetProvenance(
      fixture([
        [node({ name: "label", type: "TEXT" }), instance("ic", LOCAL_ICON)],
        [node({ name: "label", type: "TEXT" }), instance("ic", LOCAL_ICON)],
        [
          node({ name: "label", type: "TEXT" }),
          instance("trailing", LOCAL_ICON),
        ],
      ]),
    );
    expect(result.status).toBe("warn");
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0].count).toBe(3);
    // One representative node, the first occurrence.
    expect(result.findings[0].nodeName).toBe("ic");
  });

  it("keeps distinct offending main components as separate findings", () => {
    const other = { key: "ghi789", name: "ic-close", remote: false };
    const result = checkAssetProvenance(
      fixture([
        [
          instance("a", LOCAL_ICON),
          instance("b", other),
          node({ name: "t", type: "TEXT" }),
        ],
      ]),
    );
    expect(result.findings).toHaveLength(2);
    expect(result.findings.map((f) => f.count)).toEqual([1, 1]);
  });

  it("reports the mixed case: raw vector and a local instance together", () => {
    // Raw geometry is the only certain defect, so it drives the fail status
    // even though the local-instance finding alongside it is only a warning.
    const result = checkAssetProvenance(
      fixture([
        [
          node({ name: "label", type: "TEXT" }),
          node({ name: "Vector 3", type: "VECTOR" }),
          instance("ic", LOCAL_ICON),
          instance("badge", REMOTE_ICON),
        ],
      ]),
    );
    expect(result.status).toBe("fail");
    expect(result.findings).toHaveLength(2);
    expect(result.findings.map((f) => f.message).join(" ")).toMatch(
      /raw vector/i,
    );
    expect(result.findings.map((f) => f.message).join(" ")).toMatch(
      /in this file rather than a library/i,
    );
    // A remote instance was still seen, so the caveat still applies.
    expect(result.note).toBeDefined();
  });

  it("warns rather than guessing when a main component cannot be resolved", () => {
    const result = checkAssetProvenance(
      fixture([
        [
          node({ name: "label", type: "TEXT" }),
          node({ name: "ic", type: "INSTANCE" }),
        ],
      ]),
    );
    expect(result.status).toBe("warn");
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0].message).toMatch(/could not be resolved/i);
  });

  it("dedupes raw vectors by layer name across variants", () => {
    const result = checkAssetProvenance(
      fixture([
        [
          node({ name: "label", type: "TEXT" }),
          node({ name: "Vector", type: "VECTOR" }),
        ],
        [
          node({ name: "label", type: "TEXT" }),
          node({ name: "Vector", type: "VECTOR" }),
        ],
      ]),
    );
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0].count).toBe(2);
  });

  it("looks through nested frames for vectors and instances", () => {
    const result = checkAssetProvenance(
      fixture([
        [
          node({
            name: "content",
            children: [
              node({ name: "label", type: "TEXT" }),
              node({
                name: "art",
                children: [node({ name: "Vector 1", type: "VECTOR" })],
              }),
            ],
          }),
        ],
      ]),
    );
    expect(result.status).toBe("fail");
    expect(result.findings[0].nodeName).toBe("Vector 1");
  });

  // --- #122: the approved-key manifest ---
  //
  // Every test above runs against the *bundled* manifest, which ships
  // ungenerated on purpose - that is what pins the pre-#122 fallback behaviour.
  // These inject one instead.
  describe("with an approved-asset manifest", () => {
    const manifest = (
      components: AssetManifest["components"],
      generatedAt: string | null = "2026-07-28",
    ): AssetManifest => ({
      generatedAt,
      source: { fileKey: "found4t10ns", fileName: "Kido Foundations" },
      components,
    });

    const CURRENT = manifest({
      [REMOTE_ICON.key]: { name: REMOTE_ICON.name, page: "Icons / Core" },
    });

    it("verifies a remote instance the manifest lists, and drops the caveat", () => {
      const result = checkAssetProvenance(
        fixture([
          [node({ name: "label", type: "TEXT" }), instance("ic", REMOTE_ICON)],
        ]),
        CURRENT,
      );
      expect(result.status).toBe("pass");
      expect(result.findings).toEqual([]);
      // The whole point of the manifest: this pass rests on evidence, so the
      // unverifiable-origin caveat would now be a false statement.
      expect(result.note).not.toMatch(/cannot be verified/i);
      expect(result.note).toMatch(/verified against/i);
      expect(result.note).toContain("2026-07-28");
      expect(result.note).toContain("Kido Foundations");
    });

    it("fails an asset published on a deprecated page", () => {
      const result = checkAssetProvenance(
        fixture([
          [node({ name: "label", type: "TEXT" }), instance("ic", REMOTE_ICON)],
        ]),
        manifest({
          [REMOTE_ICON.key]: {
            name: REMOTE_ICON.name,
            page: "Icons (deprecated)",
            set: "Icon",
          },
        }),
      );
      expect(result.status).toBe("fail");
      expect(result.findings).toHaveLength(1);
      const [found] = result.findings;
      expect(found.severity).toBe("high");
      // The row has to name the directory it is rejecting, or there is nothing
      // to act on.
      expect(found.message).toContain("Icons (deprecated)");
      expect(found.message).toContain("Icon");
    });

    it("warns, naming the manifest date, when the key is absent", () => {
      const result = checkAssetProvenance(
        fixture([
          [node({ name: "label", type: "TEXT" }), instance("ic", REMOTE_ICON)],
        ]),
        manifest({ someOtherKey: { name: "Logo", page: "Logos" } }),
      );
      // Deliberately not a fail: an asset published after the manifest was taken
      // is legitimately absent, and only the date makes that decidable.
      expect(result.status).toBe("warn");
      expect(result.findings).toHaveLength(1);
      expect(result.findings[0].severity).toBe("medium");
      expect(result.findings[0].message).toContain("2026-07-28");
      expect(result.findings[0].suggestedFix).toMatch(/regenerate/i);
    });

    it("omits the date when the manifest has none", () => {
      const result = checkAssetProvenance(
        fixture([
          [node({ name: "label", type: "TEXT" }), instance("ic", REMOTE_ICON)],
        ]),
        manifest({ someOtherKey: { name: "Logo", page: "Logos" } }, null),
      );
      expect(result.findings[0].message).not.toContain("generated");
    });

    it("reports one row per offending set, however many variants were used", () => {
      const setOf = (key: string) => ({
        key,
        name: "Size=24",
        setId: "set:icon",
        setName: "Icon",
        remote: true,
      });
      const result = checkAssetProvenance(
        fixture([
          [instance("ic", setOf("v1")), instance("trailing", setOf("v2"))],
        ]),
        manifest({ unrelated: { name: "Logo", page: "Logos" } }),
      );
      expect(result.findings).toHaveLength(1);
      expect(result.findings[0].count).toBe(2);
      expect(result.findings[0].message).toContain("Icon");
    });

    it("keeps the verified note when another rule fails the row", () => {
      // The note narrows what the *rest* of the row is worth, so a failure
      // elsewhere must not swallow it.
      const result = checkAssetProvenance(
        fixture([
          [
            instance("ic", REMOTE_ICON),
            node({ name: "Vector", type: "VECTOR" }),
          ],
        ]),
        CURRENT,
      );
      expect(result.status).toBe("fail");
      expect(result.note).toMatch(/verified against/i);
    });

    it("still caveats a remote instance when the manifest is ungenerated", () => {
      // The fallback has to survive: a fresh clone must not report defects that
      // are not there.
      const result = checkAssetProvenance(
        fixture([
          [node({ name: "label", type: "TEXT" }), instance("ic", REMOTE_ICON)],
        ]),
        manifest({}, "2026-07-28"),
      );
      expect(result.status).toBe("pass");
      expect(result.note).toMatch(/cannot be verified/i);
    });
  });
});
