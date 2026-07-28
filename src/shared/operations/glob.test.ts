import { describe, expect, it } from "vitest";
import { globToRegex } from "./glob";

describe("globToRegex", () => {
  it("treats a pattern with no wildcard as an exact match", () => {
    const re = globToRegex("Button");
    expect(re.test("Button")).toBe(true);
    expect(re.test("Icon Button")).toBe(false);
    expect(re.test("Buttons")).toBe(false);
  });

  it("anchors both ends", () => {
    const re = globToRegex("Btn*");
    expect(re.test("Btn/Primary")).toBe(true);
    expect(re.test("Icon Btn/Primary")).toBe(false);
  });

  it("matches a trailing wildcard with the empty string", () => {
    expect(globToRegex("Btn*").test("Btn")).toBe(true);
  });

  it("supports several wildcards", () => {
    const re = globToRegex("*con*");
    expect(re.test("Icon / Check")).toBe(true);
    expect(re.test("Beacon")).toBe(true);
    expect(re.test("Button")).toBe(false);
  });

  // Worth pinning: `*Icon*` silently missing `check_box_icon` is exactly the
  // kind of empty result that reads as "the file has none of those".
  it("matches case-sensitively", () => {
    expect(globToRegex("*Icon*").test("check_box_icon")).toBe(false);
    expect(globToRegex("*icon*").test("check_box_icon")).toBe(true);
  });

  it("escapes regex metacharacters so they match literally", () => {
    const re = globToRegex("Icon (24px)");
    expect(re.test("Icon (24px)")).toBe(true);
    expect(re.test("Icon 24px")).toBe(false);
  });

  it("does not let a dot in the pattern match any character", () => {
    const re = globToRegex("v1.0");
    expect(re.test("v1.0")).toBe(true);
    expect(re.test("v1x0")).toBe(false);
  });
});
