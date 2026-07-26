/**
 * Covers the misprint half of the icon-care description writer (issue #98):
 * the marker it writes and how it re-detects an existing one now come from
 * `shared/misprint`, so a renamed component's marker is corrected in place and
 * an unrelated leading-dash line is left alone.
 */

import { describe, it, expect } from "vitest";
import { addComponentDescription } from "./addComponentDescription";
import { createMisprintText } from "../../../shared/misprint";

/** Minimal stand-in for the two node fields the writer touches. */
function node(name: string, description = "") {
  return { name, description } as unknown as ComponentNode;
}

const OPTIONS = {
  includeStatus: false,
  includeGuidelines: false,
  hexColor: "000000",
} as const;

describe("addComponentDescription — misprint marker", () => {
  it("appends the shared marker format", () => {
    const element = node("Button");
    addComponentDescription([element], { ...OPTIONS });

    // Leading newline: an empty description splits to [""], so the marker is
    // appended after that empty line. Pre-existing behaviour, pinned here.
    expect(element.description).toBe(`\n${createMisprintText("Button")}`);
  });

  it("replaces a stale marker in place after a rename", () => {
    const element = node("Button", createMisprintText("Buton"));
    addComponentDescription([element], { ...OPTIONS });

    expect(element.description).toBe(createMisprintText("Button"));
  });

  it("replaces a prefix/casing-variant marker in place", () => {
    const element = node("Button", "-- Misprint: נואאםמ");
    addComponentDescription([element], { ...OPTIONS });

    expect(element.description).toBe(createMisprintText("Button"));
  });

  it("leaves an unrelated leading-dash line alone", () => {
    const element = node("Button", "- a bullet point");
    addComponentDescription([element], { ...OPTIONS });

    expect(element.description).toBe(
      `- a bullet point\n${createMisprintText("Button")}`,
    );
  });
});
