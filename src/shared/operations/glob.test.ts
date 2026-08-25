import { describe, expect, it } from "vitest";
import { globToMatcher } from "./glob";

describe("globToMatcher", () => {
  it("treats a pattern with no wildcard as an exact match", () => {
    const m = globToMatcher("Button");
    expect(m.test("Button")).toBe(true);
    expect(m.test("Icon Button")).toBe(false);
    expect(m.test("Buttons")).toBe(false);
  });

  it("anchors both ends", () => {
    const m = globToMatcher("Btn*");
    expect(m.test("Btn/Primary")).toBe(true);
    expect(m.test("Icon Btn/Primary")).toBe(false);
  });

  it("matches a trailing wildcard with the empty string", () => {
    expect(globToMatcher("Btn*").test("Btn")).toBe(true);
  });

  it("supports several wildcards", () => {
    const m = globToMatcher("*con*");
    expect(m.test("Icon / Check")).toBe(true);
    expect(m.test("Beacon")).toBe(true);
    expect(m.test("Button")).toBe(false);
  });

  // Worth pinning: `*Icon*` silently missing `check_box_icon` is exactly the
  // kind of empty result that reads as "the file has none of those".
  it("matches case-sensitively", () => {
    expect(globToMatcher("*Icon*").test("check_box_icon")).toBe(false);
    expect(globToMatcher("*icon*").test("check_box_icon")).toBe(true);
  });

  it("escapes regex metacharacters so they match literally", () => {
    const m = globToMatcher("Icon (24px)");
    expect(m.test("Icon (24px)")).toBe(true);
    expect(m.test("Icon 24px")).toBe(false);
  });

  it("does not let a dot in the pattern match any character", () => {
    const m = globToMatcher("v1.0");
    expect(m.test("v1.0")).toBe(true);
    expect(m.test("v1x0")).toBe(false);
  });

  // The wildcard has to consume at least nothing, but the literals on either
  // side of it may not share a character to make a match.
  it("does not let the anchored ends overlap", () => {
    expect(globToMatcher("a*b").test("ab")).toBe(true);
    expect(globToMatcher("ab*bc").test("abc")).toBe(false);
    expect(globToMatcher("ab*bc").test("abbc")).toBe(true);
  });

  it("treats a bare wildcard as matching anything, including the empty name", () => {
    const m = globToMatcher("*");
    expect(m.test("")).toBe(true);
    expect(m.test("Button/Primary")).toBe(true);
  });

  it("collapses repeated wildcards", () => {
    const m = globToMatcher("Icon**Check");
    expect(m.test("IconCheck")).toBe(true);
    expect(m.test("Icon / Check")).toBe(true);
  });

  it("requires the middle segments in order", () => {
    const m = globToMatcher("*a*b*");
    expect(m.test("xaybz")).toBe(true);
    expect(m.test("xbyaz")).toBe(false);
  });

  // A newline is a character like any other. The RegExp this replaced joined
  // the segments with `.*`, and `.` does not cross a newline, so this name was
  // unmatchable by any pattern - an implementation detail leaking into the
  // dialect, since Figma node names can contain newlines.
  it("lets a wildcard span a newline", () => {
    expect(globToMatcher("Icon/*").test("Icon/a\nb")).toBe(true);
    expect(globToMatcher("*a*b*").test("x\na\nb\n")).toBe(true);
    expect(globToMatcher("Icon/*").test("Other/a\nb")).toBe(false);
  });

  // The regression this matcher exists for. The RegExp it replaced joined the
  // segments with `.*`, and 22 wildcards against a non-matching name backtracked
  // for 111 seconds on the plugin thread - per candidate name in the file.
  //
  // No wall-clock assertion: a timing bound is a flaky test on a loaded CI box,
  // and it is not needed to catch this. The count is set where the two
  // implementations are not near each other but astronomically apart - a scan
  // finishes in microseconds, while backtracking this pattern outlives the
  // suite - so the guard is that the test returns at all, and a regression
  // fails it by timing out rather than by missing a threshold.
  it("rejects a many-wildcard pattern without backtracking", () => {
    const pattern = "*" + "a*".repeat(40) + "b";
    const name = "Button/" + "a".repeat(120);
    expect(globToMatcher(pattern).test(name)).toBe(false);
  });
});
