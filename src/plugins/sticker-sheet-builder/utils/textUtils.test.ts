import { describe, it, expect } from "vitest";
import { capitalizeFirstLetter } from "./textUtils";

describe("capitalizeFirstLetter", () => {
  it("uppercases the first letter of a lowercase word", () => {
    expect(capitalizeFirstLetter("primary")).toBe("Primary");
  });

  it("leaves an already-capitalized word unchanged", () => {
    expect(capitalizeFirstLetter("Primary")).toBe("Primary");
  });

  it("returns an empty string unchanged", () => {
    expect(capitalizeFirstLetter("")).toBe("");
  });

  it("only affects the first character, not the rest of the word", () => {
    expect(capitalizeFirstLetter("hELLO")).toBe("HELLO");
  });
});
