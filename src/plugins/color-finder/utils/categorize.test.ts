import { describe, it, expect } from "vitest";
import { isIconName, roleFor, roundOpacity } from "./categorize";

describe("roleFor", () => {
  it("maps any stroke to border, regardless of node type or icon", () => {
    expect(roleFor("TEXT", "stroke")).toBe("border");
    expect(roleFor("FRAME", "stroke")).toBe("border");
    expect(roleFor("RECTANGLE", "stroke")).toBe("border");
    expect(roleFor("VECTOR", "stroke", true)).toBe("border");
  });

  it("maps a fill on a TEXT node to text", () => {
    expect(roleFor("TEXT", "fill")).toBe("text");
  });

  it("maps any other fill to background", () => {
    expect(roleFor("FRAME", "fill")).toBe("background");
    expect(roleFor("RECTANGLE", "fill")).toBe("background");
    expect(roleFor("INSTANCE", "fill")).toBe("background");
  });

  it("routes a fill on an icon node to icon, beating text and background", () => {
    expect(roleFor("VECTOR", "fill", true)).toBe("icon");
    expect(roleFor("FRAME", "fill", true)).toBe("icon");
    expect(roleFor("TEXT", "fill", true)).toBe("icon");
  });
});

describe("isIconName", () => {
  it("matches names containing an icon token (any case)", () => {
    for (const name of [
      "icon",
      "Icon",
      "ICON",
      "icon/search",
      "my-icon",
      "Icons/Add",
      "iconButton",
      "myIconButton",
    ]) {
      expect(isIconName(name), name).toBe(true);
    }
  });

  it("matches a standalone 'ic' short-prefix token", () => {
    for (const name of ["ic", "ic_search", "ic-arrow", "ic/home"]) {
      expect(isIconName(name), name).toBe(true);
    }
  });

  it("does not match 'ic'-ending words, even before a separator", () => {
    for (const name of [
      "Logic",
      "Graphic",
      "Vertical",
      "Notice",
      "Slice",
      "Music",
      "Click",
      "Music/note",
      "Magic-wand",
      "Epic/hero",
      "Graphic-1",
      "Traffic/light",
    ]) {
      expect(isIconName(name), name).toBe(false);
    }
  });
});

describe("roundOpacity", () => {
  it("rounds float noise to a stable precision so colors don't split", () => {
    expect(roundOpacity(0.6000000001)).toBe(roundOpacity(0.6));
    expect(roundOpacity(0.6)).toBe(0.6);
  });

  it("leaves clean values intact", () => {
    expect(roundOpacity(1)).toBe(1);
    expect(roundOpacity(0)).toBe(0);
    expect(roundOpacity(0.5)).toBe(0.5);
  });
});
