import { describe, it, expect, vi } from "vitest";
import {
  getComponentPropertyInfo,
  getComponentDescription,
  findExposedInstances,
  handleBuildComponent,
} from "./logic";
import { BuildData } from "./types";

function build(
  data: Omit<BuildData, "componentKey"> & { componentKey: string },
) {
  return data as BuildData & { requestId?: string };
}

describe("getComponentPropertyInfo", () => {
  it("maps each definition to a PropertyInfo, sorted by name", () => {
    const node = {
      componentPropertyDefinitions: {
        Zebra: { type: "TEXT", defaultValue: "z" },
        Apple: { type: "BOOLEAN", defaultValue: true },
      },
    } as unknown as ComponentNode;

    const result = getComponentPropertyInfo(node);

    expect(result.map((p) => p.name)).toEqual(["Apple", "Zebra"]);
    expect(result[0]).toEqual({
      name: "Apple",
      type: "BOOLEAN",
      defaultValue: true,
      variantOptions: undefined,
    });
  });

  it("skips definitions whose key is blank or whitespace-only", () => {
    const node = {
      componentPropertyDefinitions: {
        "": { type: "TEXT" },
        "   ": { type: "TEXT" },
        Real: { type: "TEXT" },
      },
    } as unknown as ComponentNode;

    expect(getComponentPropertyInfo(node).map((p) => p.name)).toEqual(["Real"]);
  });

  it("returns an empty array when there are no definitions", () => {
    const node = {
      componentPropertyDefinitions: undefined,
    } as unknown as ComponentNode;
    expect(getComponentPropertyInfo(node)).toEqual([]);
  });

  it("returns an empty array (rather than throwing) when the node is falsy", () => {
    expect(getComponentPropertyInfo(null as unknown as ComponentNode)).toEqual(
      [],
    );
  });
});

describe("getComponentDescription", () => {
  it("returns the node's own trimmed description when present", () => {
    const node = {
      description: "  Use for primary actions  ",
    } as unknown as ComponentNode;
    expect(getComponentDescription(node)).toBe("Use for primary actions");
  });

  it("falls back to the default variant's description on a component set", () => {
    const node = {
      type: "COMPONENT_SET",
      description: "",
      defaultVariant: { description: "Variant-level description" },
    } as unknown as ComponentSetNode;
    expect(getComponentDescription(node)).toBe("Variant-level description");
  });

  it("falls back to a placeholder when nothing has a description", () => {
    const node = {
      type: "COMPONENT_SET",
      description: "",
      defaultVariant: { description: "" },
    } as unknown as ComponentSetNode;
    expect(getComponentDescription(node)).toBe("No description available");
  });

  it("does not consult defaultVariant for a plain component", () => {
    const node = {
      type: "COMPONENT",
      description: "",
    } as unknown as ComponentNode;
    expect(getComponentDescription(node)).toBe("No description available");
  });
});

describe("findExposedInstances", () => {
  it("collects exposed instance children with name/id/key", () => {
    const node = {
      findAll: (predicate: (n: any) => boolean) => {
        const candidates = [
          {
            type: "INSTANCE",
            exposedInstances: true,
            name: "Icon",
            id: "1:1",
            mainComponent: { key: "icon-key" },
          },
          { type: "FRAME", name: "Wrapper" },
        ];
        return candidates.filter(predicate);
      },
    } as unknown as ComponentNode;

    expect(findExposedInstances(node)).toEqual([
      { name: "Icon", id: "1:1", key: "icon-key" },
    ]);
  });

  it("uses an empty string for key when mainComponent is missing", () => {
    const node = {
      findAll: (predicate: (n: any) => boolean) =>
        [
          {
            type: "INSTANCE",
            exposedInstances: true,
            name: "Icon",
            id: "1:1",
            mainComponent: null,
          },
        ].filter(predicate),
    } as unknown as ComponentNode;

    expect(findExposedInstances(node)[0].key).toBe("");
  });

  it("returns an empty array (rather than throwing) if findAll throws", () => {
    const node = {
      findAll: () => {
        throw new Error("boom");
      },
    } as unknown as ComponentNode;
    expect(findExposedInstances(node)).toEqual([]);
  });
});

// --- handleBuildComponent -----------------------------------------------
//
// Fakes stand in for Figma nodes. Deliberately omit `findAll` /
// `fillStyleId` / `strokeStyleId` / `effectStyleId` so localizeClone's
// isContainer() check is false and it no-ops without touching a (missing)
// global `figma`.

function makeVariant(name: string) {
  return { type: "COMPONENT", name, remove: vi.fn() };
}

function makeComponentSet(opts: {
  name?: string;
  propertyDefs: Record<string, any>;
  variants: ReturnType<typeof makeVariant>[];
}) {
  const node: any = {
    type: "COMPONENT_SET",
    name: opts.name ?? "Button",
    id: "set-1",
    componentPropertyDefinitions: { ...opts.propertyDefs },
    children: opts.variants,
    defaultVariant: opts.variants[0],
    deleteComponentProperty: vi.fn((propName: string) => {
      delete node.componentPropertyDefinitions[propName];
    }),
  };
  node.clone = () => node;
  return node;
}

function makeFigma(componentSet: any) {
  return {
    importComponentSetByKeyAsync: vi.fn().mockResolvedValue(componentSet),
    importComponentByKeyAsync: vi.fn(),
    currentPage: { appendChild: vi.fn(), selection: [] as unknown[] },
    viewport: { scrollAndZoomIntoView: vi.fn() },
    notify: vi.fn(),
    ui: { postMessage: vi.fn() },
  };
}

describe("handleBuildComponent", () => {
  it("deletes a disabled non-variant property", async () => {
    const variants = [makeVariant("State=Idle")];
    const componentSet = makeComponentSet({
      propertyDefs: { Disabled: { type: "BOOLEAN" } },
      variants,
    });
    const figma = makeFigma(componentSet);

    await handleBuildComponent(
      build({ componentKey: "key-1", Disabled: false }),
      figma,
    );

    expect(componentSet.deleteComponentProperty).toHaveBeenCalledWith(
      "Disabled",
    );
  });

  it("removes only the variants whose option was disabled", async () => {
    const small = makeVariant("Size=Small");
    const large = makeVariant("Size=Large");
    const componentSet = makeComponentSet({
      propertyDefs: {
        Size: { type: "VARIANT", variantOptions: ["Small", "Large"] },
      },
      variants: [small, large],
    });
    const figma = makeFigma(componentSet);

    await handleBuildComponent(
      build({ componentKey: "key-1", "Size#Large": false }),
      figma,
    );

    expect(large.remove).toHaveBeenCalled();
    expect(small.remove).not.toHaveBeenCalled();
  });

  it("keeps the property when no option was disabled", async () => {
    const small = makeVariant("Size=Small");
    const large = makeVariant("Size=Large");
    const componentSet = makeComponentSet({
      propertyDefs: {
        Size: { type: "VARIANT", variantOptions: ["Small", "Large"] },
      },
      variants: [small, large],
    });
    const figma = makeFigma(componentSet);

    await handleBuildComponent(build({ componentKey: "key-1" }), figma);

    expect(small.remove).not.toHaveBeenCalled();
    expect(large.remove).not.toHaveBeenCalled();
    expect(componentSet.deleteComponentProperty).not.toHaveBeenCalled();
  });

  it("falls back to the property's default value when the whole property is disabled", async () => {
    const small = makeVariant("Size=Small");
    const large = makeVariant("Size=Large");
    const componentSet = makeComponentSet({
      propertyDefs: {
        Size: {
          type: "VARIANT",
          variantOptions: ["Small", "Large"],
          defaultValue: "Large",
        },
      },
      variants: [small, large],
    });
    const figma = makeFigma(componentSet);

    await handleBuildComponent(
      build({ componentKey: "key-1", Size: false }),
      figma,
    );

    expect(small.remove).toHaveBeenCalled();
    expect(large.remove).not.toHaveBeenCalled();
    expect(componentSet.deleteComponentProperty).toHaveBeenCalledWith("Size");
  });

  it("keeps at least one variant even if every option ends up disabled and there is no usable default", async () => {
    const onlyVariant = makeVariant("Size=Small");
    const componentSet = makeComponentSet({
      propertyDefs: {
        Size: { type: "VARIANT", variantOptions: ["Small"] },
      },
      variants: [onlyVariant],
    });
    const figma = makeFigma(componentSet);

    await handleBuildComponent(
      build({ componentKey: "key-1", "Size#Small": false }),
      figma,
    );

    expect(onlyVariant.remove).not.toHaveBeenCalled();
  });

  it("warns instead of throwing when a variant property can't be deleted", async () => {
    const small = makeVariant("Size=Small");
    const large = makeVariant("Size=Large");
    const componentSet = makeComponentSet({
      propertyDefs: {
        Size: {
          type: "VARIANT",
          variantOptions: ["Small", "Large"],
          defaultValue: "Large",
        },
      },
      variants: [small, large],
    });
    componentSet.deleteComponentProperty = vi.fn(() => {
      throw new Error("cannot delete last variant property");
    });
    const figma = makeFigma(componentSet);

    await handleBuildComponent(
      build({ componentKey: "key-1", Size: false }),
      figma,
    );

    expect(figma.notify).toHaveBeenCalledWith(expect.stringContaining("Size"), {
      timeout: 5000,
    });
  });

  it("places the built clone on the canvas and selects it", async () => {
    const variants = [makeVariant("State=Idle")];
    const componentSet = makeComponentSet({ propertyDefs: {}, variants });
    const figma = makeFigma(componentSet);

    await handleBuildComponent(build({ componentKey: "key-1" }), figma);

    expect(figma.currentPage.appendChild).toHaveBeenCalledWith(componentSet);
    expect(figma.currentPage.selection).toEqual([componentSet]);
    expect(figma.viewport.scrollAndZoomIntoView).toHaveBeenCalledWith([
      componentSet,
    ]);
  });

  it("throws when no component key is provided", async () => {
    const componentSet = makeComponentSet({ propertyDefs: {}, variants: [] });
    const figma = makeFigma(componentSet);

    await expect(
      handleBuildComponent(build({ componentKey: "" }), figma),
    ).rejects.toThrow("Component key is required");
  });
});
