import { describe, it, expect, vi } from "vitest";
import { getComponentProps } from "./getComponentProps";

describe("getComponentProps", () => {
  it("buckets property definitions by their declared type", () => {
    const mainComponent = {
      componentPropertyDefinitions: {
        Size: { type: "VARIANT", variantOptions: ["Small", "Large"] },
        Disabled: { type: "BOOLEAN", defaultValue: false },
        Label: { type: "TEXT", defaultValue: "Button" },
        Icon: { type: "INSTANCE_SWAP", defaultValue: "1:1" },
      },
    } as unknown as ComponentNode;

    const result = getComponentProps(mainComponent);

    expect(Object.keys(result.variant)).toEqual(["Size"]);
    expect(Object.keys(result.boolean)).toEqual(["Disabled"]);
    expect(Object.keys(result.text)).toEqual(["Label"]);
    expect(Object.keys(result.instanceSwap)).toEqual(["Icon"]);
  });

  it("returns empty buckets when there are no property definitions", () => {
    const mainComponent = {
      componentPropertyDefinitions: {},
    } as unknown as ComponentNode;

    expect(getComponentProps(mainComponent)).toEqual({
      variant: {},
      boolean: {},
      text: {},
      instanceSwap: {},
    });
  });

  it("warns and drops properties with an unrecognized type", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const mainComponent = {
      componentPropertyDefinitions: {
        Mystery: { type: "UNKNOWN_TYPE" },
      },
    } as unknown as ComponentNode;

    const result = getComponentProps(mainComponent);

    expect(result).toEqual({
      variant: {},
      boolean: {},
      text: {},
      instanceSwap: {},
    });
    expect(warn).toHaveBeenCalledWith("Unhandled property type: UNKNOWN_TYPE");
    warn.mockRestore();
  });
});
