import { describe, it, expect } from "vitest";
import { getProps } from "./getAllVariantProps";

function variantDef(options: string[]) {
  return { variantOptions: options };
}

describe("getProps", () => {
  it("buckets a size property into sizeProps as [name, definition] pairs", () => {
    const result = getProps({
      variant: { Size: variantDef(["Small", "Large"]) },
    });
    expect(result.sizeProps).toEqual(["Size", variantDef(["Small", "Large"])]);
  });

  it("buckets a state property (by name) into stateProps", () => {
    const result = getProps({
      variant: { State: variantDef(["Idle", "Hover"]) },
    });
    expect(result.stateProps).toEqual(["State", variantDef(["Idle", "Hover"])]);
  });

  it("buckets a property into stateProps when its options look like states, even if not named State", () => {
    const result = getProps({
      variant: { Interaction: variantDef(["Idle", "Pressed"]) },
    });
    expect(result.stateProps).toEqual([
      "Interaction",
      variantDef(["Idle", "Pressed"]),
    ]);
  });

  it("buckets a property into typeProps when its options look like types", () => {
    const result = getProps({
      variant: { Kind: variantDef(["Primary", "Secondary"]) },
    });
    expect(result.typeProps).toEqual([
      "Kind",
      variantDef(["Primary", "Secondary"]),
    ]);
  });

  it("buckets a two-option boolean-like property into binaryProps as a nested pair", () => {
    const result = getProps({
      variant: { Disabled: variantDef(["True", "False"]) },
    });
    expect(result.binaryProps).toEqual([
      ["Disabled", variantDef(["True", "False"])],
    ]);
  });

  it("recognizes on/off as a binary pair too", () => {
    const result = getProps({
      variant: { Visible: variantDef(["On", "Off"]) },
    });
    expect(result.binaryProps).toEqual([
      ["Visible", variantDef(["On", "Off"])],
    ]);
  });

  it("falls through to allOtherProps when nothing else matches", () => {
    const result = getProps({
      variant: { Icon: variantDef(["Star", "Heart", "Bolt"]) },
    });
    expect(result.allOtherProps).toEqual([
      ["Icon", variantDef(["Star", "Heart", "Bolt"])],
    ]);
  });

  it("checks size by property name before checking option shape", () => {
    // Two options that would otherwise read as binary, but the name "size" wins.
    const result = getProps({
      variant: { size: variantDef(["true", "false"]) },
    });
    expect(result.sizeProps).toEqual(["size", variantDef(["true", "false"])]);
    expect(result.binaryProps).toEqual([]);
  });

  it("classifies multiple properties independently", () => {
    const result = getProps({
      variant: {
        Size: variantDef(["Small", "Large"]),
        State: variantDef(["Idle", "Hover"]),
        Kind: variantDef(["Primary", "Secondary"]),
        Disabled: variantDef(["True", "False"]),
        Icon: variantDef(["Star", "Heart", "Bolt"]),
      },
    });
    expect(result.sizeProps).toEqual(["Size", variantDef(["Small", "Large"])]);
    expect(result.stateProps).toEqual(["State", variantDef(["Idle", "Hover"])]);
    expect(result.typeProps).toEqual([
      "Kind",
      variantDef(["Primary", "Secondary"]),
    ]);
    expect(result.binaryProps).toEqual([
      ["Disabled", variantDef(["True", "False"])],
    ]);
    expect(result.allOtherProps).toEqual([
      ["Icon", variantDef(["Star", "Heart", "Bolt"])],
    ]);
  });

  it("returns empty buckets when there are no variant properties", () => {
    const result = getProps({ variant: {} });
    expect(result).toEqual({
      stateProps: [],
      typeProps: [],
      sizeProps: [],
      binaryProps: [],
      allOtherProps: [],
    });
  });
});
