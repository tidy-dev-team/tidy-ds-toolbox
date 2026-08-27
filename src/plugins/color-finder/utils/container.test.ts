import { describe, expect, it } from "vitest";

import {
  ContainerNode,
  descendChain,
  emptyChain,
  pickContainer,
  seedChainFromAncestors,
} from "./container";

// Builds a tree of plain nodes with real `parent` links, so the seeding walk
// (which climbs) and the descending walk (which does not) see the same shape.
interface Spec {
  id: string;
  type: string;
  children?: Spec[];
}

// A fixture node. `children` is the test's own business - the module under test
// only ever climbs, so it names nothing but the four fields it reads.
interface TreeNode extends ContainerNode {
  readonly parent: TreeNode | null;
  children: TreeNode[];
}

function build(spec: Spec, parent: TreeNode | null = null): TreeNode {
  const node: TreeNode = {
    id: spec.id,
    name: spec.id,
    type: spec.type,
    parent,
    children: [],
  };
  node.children = (spec.children ?? []).map((child) => build(child, node));
  return node;
}

function find(root: TreeNode, id: string): TreeNode {
  const hit = tryFind(root, id);
  if (!hit) throw new Error(`no node ${id}`);
  return hit;
}

function tryFind(root: TreeNode, id: string): TreeNode | null {
  if (root.id === id) return root;
  for (const child of root.children) {
    const hit = tryFind(child, id);
    if (hit) return hit;
  }
  return null;
}

/**
 * The rule this module replaced, transcribed from the `resolveContainer` that
 * a1af28e deleted from `scan.ts`.
 *
 * It is the oracle. Without it the equivalence test below only proves that the
 * seeding climb and the scan's descent agree with each other - which they would
 * even if both had misread the behaviour they replaced. Comparing against this
 * is what pins the ranking priority to what the scan actually used to do.
 *
 * Do not "fix" this to match the module. If the two disagree, either the module
 * changed the attribution rule or the transcription is wrong, and both are worth
 * stopping for.
 */
function containerByClimbing(node: TreeNode): string {
  let componentSet: TreeNode | null = null;
  let instanceOrComponent: TreeNode | null = null;
  let section: TreeNode | null = null;
  let cur: TreeNode = node;

  while (
    cur.parent &&
    cur.parent.type !== "PAGE" &&
    cur.parent.type !== "DOCUMENT"
  ) {
    cur = cur.parent;
    if (cur.type === "COMPONENT_SET" && !componentSet) {
      componentSet = cur;
    } else if (
      (cur.type === "INSTANCE" || cur.type === "COMPONENT") &&
      !instanceOrComponent
    ) {
      instanceOrComponent = cur;
    }
    if (cur.type === "SECTION" && !section) section = cur;
  }

  const chosen = componentSet ?? instanceOrComponent ?? section ?? cur;
  return chosen.name;
}

// What the scan itself computes: the chain carried down from the page, then
// ranked at the leaf.
function containerByDescent(root: TreeNode, id: string): string {
  let chain = emptyChain();
  const path: TreeNode[] = [];
  for (let cur: TreeNode | null = find(root, id); cur; cur = cur.parent) {
    path.unshift(cur);
  }
  // path[0] is the page; roots are its children.
  for (let i = 1; i < path.length - 1; i++) {
    chain = descendChain(chain, path[i]);
  }
  return pickContainer(chain, path[path.length - 1]).name;
}

const PAGE: Spec = {
  id: "page",
  type: "PAGE",
  children: [
    {
      id: "top-frame",
      type: "FRAME",
      children: [
        {
          id: "set",
          type: "COMPONENT_SET",
          children: [
            {
              id: "variant",
              type: "COMPONENT",
              children: [{ id: "label", type: "TEXT" }],
            },
          ],
        },
        {
          id: "instance",
          type: "INSTANCE",
          children: [
            { id: "inner-rect", type: "RECTANGLE" },
            // Nested instances pin "nearest wins" over "outermost wins".
            {
              id: "nested-instance",
              type: "INSTANCE",
              children: [{ id: "deep-rect", type: "RECTANGLE" }],
            },
          ],
        },
        { id: "loose-rect", type: "RECTANGLE" },
        // Two plain ancestors with no component or section on the path, so
        // "outermost wins" for the top-level fallback is observable at all.
        {
          id: "plain-frame",
          type: "FRAME",
          children: [{ id: "plain-rect", type: "RECTANGLE" }],
        },
      ],
    },
    {
      id: "section",
      type: "SECTION",
      children: [
        {
          id: "section-frame",
          type: "FRAME",
          children: [{ id: "section-rect", type: "RECTANGLE" }],
        },
        // Nested sections pin "nearest wins" for sections.
        {
          id: "nested-section",
          type: "SECTION",
          children: [{ id: "nested-section-rect", type: "RECTANGLE" }],
        },
        // An instance inside a section pins the instance-over-section ranking,
        // which nothing else in this tree exercises.
        {
          id: "section-instance",
          type: "INSTANCE",
          children: [{ id: "section-instance-rect", type: "RECTANGLE" }],
        },
      ],
    },
    { id: "bare", type: "RECTANGLE" },
  ],
};

// Every node in PAGE, so the equivalence tests cover the whole fixture rather
// than a chosen sample.
const ALL_IDS = [
  "top-frame",
  "set",
  "variant",
  "label",
  "instance",
  "inner-rect",
  "nested-instance",
  "deep-rect",
  "loose-rect",
  "plain-frame",
  "plain-rect",
  "section",
  "section-frame",
  "section-rect",
  "nested-section",
  "nested-section-rect",
  "section-instance",
  "section-instance-rect",
  "bare",
];

describe("pickContainer", () => {
  it("attributes a node inside a variant to the enclosing component set", () => {
    const root = build(PAGE);
    expect(containerByDescent(root, "label")).toBe("set");
  });

  // Nearest-vs-outermost is pinned below for instances and sections, which can
  // legally nest. It is not pinned for component sets, which cannot: a legal
  // tree has at most one COMPONENT_SET on any path, so there is no behaviour
  // there to tell apart, and a fixture that faked one would test a shape Figma
  // never produces.

  it("attributes a node inside an instance to that instance", () => {
    const root = build(PAGE);
    expect(containerByDescent(root, "inner-rect")).toBe("instance");
  });

  it("prefers the nearest section over the top-level node", () => {
    const root = build(PAGE);
    expect(containerByDescent(root, "section-rect")).toBe("section");
  });

  it("prefers the nearest instance when instances are nested", () => {
    const root = build(PAGE);
    expect(containerByDescent(root, "deep-rect")).toBe("nested-instance");
  });

  it("prefers the nearest section when sections are nested", () => {
    const root = build(PAGE);
    expect(containerByDescent(root, "nested-section-rect")).toBe(
      "nested-section",
    );
  });

  it("prefers an enclosing instance over the section it sits in", () => {
    const root = build(PAGE);
    expect(containerByDescent(root, "section-instance-rect")).toBe(
      "section-instance",
    );
  });

  it("falls back to the top-level node under the page", () => {
    const root = build(PAGE);
    expect(containerByDescent(root, "loose-rect")).toBe("top-frame");
  });

  it("falls back to the outermost plain ancestor, not the nearest one", () => {
    const root = build(PAGE);
    expect(containerByDescent(root, "plain-rect")).toBe("top-frame");
  });

  it("falls back to the node itself when it is top-level", () => {
    const root = build(PAGE);
    expect(containerByDescent(root, "bare")).toBe("bare");
  });

  it("reports the container's id and type, not only its name", () => {
    const root = build(PAGE);
    const chain = descendChain(
      descendChain(emptyChain(), find(root, "top-frame")),
      find(root, "set"),
    );
    expect(pickContainer(chain, find(root, "variant"))).toEqual({
      id: "set",
      name: "set",
      type: "COMPONENT_SET",
    });
  });
});

describe("equivalence with the rule this module replaced", () => {
  it("descending from the page matches the deleted upward climb, for every node", () => {
    const root = build(PAGE);
    for (const id of ALL_IDS) {
      expect(containerByDescent(root, id), `container of ${id}`).toBe(
        containerByClimbing(find(root, id)),
      );
    }
  });

  it("seeding from a deep root matches the deleted upward climb too", () => {
    const root = build(PAGE);
    for (const id of ALL_IDS) {
      const node = find(root, id);
      const seeded = pickContainer(seedChainFromAncestors(node).chain, node);
      expect(seeded.name, `container of ${id}`).toBe(containerByClimbing(node));
    }
  });
});

describe("seedChainFromAncestors", () => {
  it("agrees with descending from the page, for every node in the tree", () => {
    const root = build(PAGE);
    for (const id of ALL_IDS) {
      const node = find(root, id);
      const seeded = pickContainer(seedChainFromAncestors(node).chain, node);
      expect(seeded.name, `container of ${id}`).toBe(
        containerByDescent(root, id),
      );
    }
  });

  it("reports an icon-named ancestor, so a deep root keeps its icon state", () => {
    const root = build({
      id: "page",
      type: "PAGE",
      children: [
        {
          id: "icon/star",
          type: "FRAME",
          children: [{ id: "path", type: "VECTOR" }],
        },
      ],
    });
    expect(seedChainFromAncestors(find(root, "path")).inIcon).toBe(true);
    expect(seedChainFromAncestors(find(root, "icon/star")).inIcon).toBe(false);
  });

  it("stops at the page rather than walking into the document", () => {
    const doc: ContainerNode = {
      id: "doc",
      name: "doc",
      type: "DOCUMENT",
      parent: null,
    };
    const page: ContainerNode = {
      id: "page",
      name: "icon/misleading-page-name",
      type: "PAGE",
      parent: doc,
    };
    const rect: ContainerNode = {
      id: "rect",
      name: "rect",
      type: "RECTANGLE",
      parent: page,
    };
    const seeded = seedChainFromAncestors(rect);
    expect(seeded.inIcon).toBe(false);
    expect(pickContainer(seeded.chain, rect).name).toBe("rect");
  });
});
