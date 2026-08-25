import { describe, it, expect } from "vitest";
import {
  getSelectedComponentPayload,
  subjectsFromScan,
  type ScannedNode,
} from "./componentHelpers";
import { PLUGIN_NAMESPACE, LAST_COMPONENT_ID_KEY } from "./constants";

function node(
  id: string,
  name: string,
  parentType: string | null = "PAGE",
): ScannedNode {
  return { id, name, parentType };
}

describe("subjectsFromScan", () => {
  it("offers a component set", () => {
    expect(subjectsFromScan([node("1:1", "Button")])).toEqual([
      { id: "1:1", name: "Button" },
    ]);
  });

  it("offers a component that is not in a set", () => {
    // The bug this rule fixes: a variantless component such as Divider had no
    // set to represent it, so a set-only scan never listed it.
    expect(subjectsFromScan([node("2:1", "Divider", "SECTION")])).toEqual([
      { id: "2:1", name: "Divider" },
    ]);
  });

  it("drops a variant, because its set already stands for it", () => {
    const scanned = [
      node("1:1", "Button"),
      node("1:2", "Size=Large, State=Hover", "COMPONENT_SET"),
      node("1:3", "Size=Small, State=Hover", "COMPONENT_SET"),
    ];

    expect(subjectsFromScan(scanned)).toEqual([{ id: "1:1", name: "Button" }]);
  });

  it("keeps a component nested in a frame or another component", () => {
    const scanned = [
      node("3:1", "Icon", "FRAME"),
      node("3:2", "Badge", "COMPONENT"),
    ];

    expect(subjectsFromScan(scanned).map((s) => s.name)).toEqual([
      "Icon",
      "Badge",
    ]);
  });

  it("keeps a top-level component whose parent is the page itself", () => {
    expect(subjectsFromScan([node("4:1", "Spacer", null)])).toEqual([
      { id: "4:1", name: "Spacer" },
    ]);
  });
});

/**
 * The panel's open path, which must not walk the document.
 *
 * The fake records every lookup, so the tests below can assert the shape of the
 * work and not only its answer: one `getNodeById` and no scan is the whole
 * point of this function, and an implementation that got the right name by
 * calling `findAllWithCriteria` would be the bug back again.
 */
function fakeFigma(
  storedId: string,
  nodes: Record<string, { type: string; name: string }>,
) {
  const calls: string[] = [];
  const figma = {
    root: {
      getSharedPluginData: (ns: string, key: string) =>
        ns === PLUGIN_NAMESPACE && key === LAST_COMPONENT_ID_KEY
          ? storedId
          : "",
      setSharedPluginData: () => {
        calls.push("setSharedPluginData");
      },
      findAllWithCriteria: () => {
        calls.push("findAllWithCriteria");
        return [];
      },
    },
    getNodeById: (id: string) => {
      calls.push("getNodeById");
      const node = nodes[id];
      return node ? { id, ...node } : null;
    },
  } as unknown as PluginAPI;
  return { figma, calls };
}

describe("getSelectedComponentPayload", () => {
  it("resolves the stored component without scanning the file", () => {
    const { figma, calls } = fakeFigma("1:1", {
      "1:1": { type: "COMPONENT_SET", name: "Button" },
    });

    expect(getSelectedComponentPayload(figma)).toEqual({
      component: { id: "1:1", name: "Button" },
    });
    // The regression this function exists for: opening the panel used to walk
    // every page, which froze the plugin thread for the length of the walk.
    expect(calls).toEqual(["getNodeById"]);
  });

  it("resolves a variantless component too", () => {
    const { figma } = fakeFigma("2:1", {
      "2:1": { type: "COMPONENT", name: "Divider" },
    });
    expect(getSelectedComponentPayload(figma).component).toEqual({
      id: "2:1",
      name: "Divider",
    });
  });

  it("answers null when nothing is stored, without a lookup", () => {
    const { figma, calls } = fakeFigma("", {});
    expect(getSelectedComponentPayload(figma)).toEqual({ component: null });
    expect(calls).toEqual([]);
  });

  it("answers null for a pointer to a node that is gone", () => {
    const { figma } = fakeFigma("9:9", {});
    expect(getSelectedComponentPayload(figma).component).toBeNull();
  });

  it("answers null when the pointer no longer names a component", () => {
    // A set can be ungrouped, leaving the id pointing at a frame.
    const { figma } = fakeFigma("3:1", {
      "3:1": { type: "FRAME", name: "Button" },
    });
    expect(getSelectedComponentPayload(figma).component).toBeNull();
  });

  it("leaves a dangling pointer in place rather than guessing a new one", () => {
    // Healing belongs to getComponentsPayload, which has the real list to heal
    // against. Rewriting it here could only pick something arbitrary.
    const { figma, calls } = fakeFigma("9:9", {});
    getSelectedComponentPayload(figma);
    expect(calls).not.toContain("setSharedPluginData");
  });
});
