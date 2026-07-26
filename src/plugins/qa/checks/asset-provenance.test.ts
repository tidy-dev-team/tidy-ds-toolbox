import { describe, it, expect } from "vitest";
import { checkAssetProvenance } from "./asset-provenance";
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
  main: { key: string; name: string; remote: boolean },
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

  it("fails a nested instance whose main component is local", () => {
    const result = checkAssetProvenance(
      fixture([
        [node({ name: "label", type: "TEXT" }), instance("ic", LOCAL_ICON)],
      ]),
    );
    expect(result.status).toBe("fail");
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0].message).toMatch(/local component/i);
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
  });

  it("judges the exemption per variant, so one odd variant doesn't fail the whole icon set", () => {
    // Three vector-only variants plus one carrying a stray empty frame. Pooling
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
            node({ name: "spacer" }),
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
    expect(result.note).toBeUndefined();
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
    expect(result.status).toBe("fail");
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
      /local component/i,
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
});
