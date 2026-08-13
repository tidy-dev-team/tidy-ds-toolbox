import { describe, it, expect } from "vitest";
import { getBaseProps } from "./getBaseProps";

describe("getBaseProps", () => {
  it("returns null when there are no type, state, or other props", () => {
    expect(getBaseProps([], [], [])).toBeNull();
  });

  it("pairs type and state props together when both are present, keeping others as-is", () => {
    const result = getBaseProps(["type"], ["state"], ["other1", "other2"]);
    expect(result).toEqual({
      firstProp: ["type"],
      secondProp: ["state"],
      otherProps: ["other1", "other2"],
    });
  });

  it("uses the first 'other' prop as firstProp when only state props are present", () => {
    const result = getBaseProps([], ["state"], ["other1", "other2"]);
    expect(result).toEqual({
      firstProp: "other1",
      secondProp: ["state"],
      otherProps: ["other2"],
    });
  });

  it("falls back to null firstProp when only state props exist and there are no others", () => {
    const result = getBaseProps([], ["state"], []);
    expect(result).toEqual({
      firstProp: null,
      secondProp: ["state"],
      otherProps: [],
    });
  });

  it("uses the first 'other' prop as secondProp when only type props are present", () => {
    const result = getBaseProps(["type"], [], ["other1", "other2"]);
    expect(result).toEqual({
      firstProp: ["type"],
      secondProp: "other1",
      otherProps: ["other2"],
    });
  });

  it("falls back to null secondProp when only type props exist and there are no others", () => {
    const result = getBaseProps(["type"], [], []);
    expect(result).toEqual({
      firstProp: ["type"],
      secondProp: null,
      otherProps: [],
    });
  });

  it("uses the first two 'other' props as second/first when neither type nor state props exist", () => {
    const result = getBaseProps([], [], ["other1", "other2", "other3"]);
    expect(result).toEqual({
      firstProp: "other2",
      secondProp: "other1",
      otherProps: ["other3"],
    });
  });

  it("falls back to a null firstProp when only one 'other' prop exists", () => {
    const result = getBaseProps([], [], ["other1"]);
    expect(result).toEqual({
      firstProp: null,
      secondProp: "other1",
      otherProps: [],
    });
  });
});
