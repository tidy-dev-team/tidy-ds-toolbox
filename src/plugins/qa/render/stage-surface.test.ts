import { describe, it, expect } from "vitest";
import {
  FALLBACK_STAGE,
  fallbackStageFor,
  surfaceCaption,
} from "./stage-surface";

describe("surfaceCaption", () => {
  // Naming the token is how a wrong backdrop reads as a wrong backdrop rather
  // than as a broken component - #127's lesson, and the thing that let a bad
  // pick be diagnosed rather than believed.
  it("names the token the backdrop was bound to", () => {
    expect(surfaceCaption("bg/surface")).toContain("bg/surface");
    expect(surfaceCaption("bg/surface")).toMatch(/resolved per mode/i);
  });

  it("says the backdrop is an approximation when no token was found", () => {
    const caption = surfaceCaption(undefined);

    expect(caption).toMatch(/no surface token/i);
    // Must not imply it is the real surface, since a reader would then draw
    // contrast conclusions the picture does not support.
    expect(caption).not.toMatch(/resolved per mode/i);
  });
});

describe("fallbackStageFor", () => {
  // The policy #141 asked for, and the one an earlier version broke: every mode
  // gets the same dark backdrop, including light-named ones. A pale backdrop for
  // a light-named mode hides the pale element the check is looking for, and a
  // file with no surface token is usually not a well-formed DS at all.
  it("gives every mode the same dark backdrop, whatever it is called", () => {
    const names = ["Industrial Light", "Industrial Dark", "Compact", "light"];
    const fills = new Set(names.map(fallbackStageFor));

    expect(fills).toEqual(new Set([FALLBACK_STAGE]));
  });
});

describe("FALLBACK_STAGE", () => {
  // #141 asked for a dark fallback specifically, because the toolbox is pointed
  // at elements that are not from a well-formed DS - and a pale backdrop there
  // hides the pale element the check is looking for.
  it("is dark, and not pure black", () => {
    const channels = [1, 3, 5].map((at) =>
      parseInt(FALLBACK_STAGE.slice(at, at + 2), 16),
    );

    expect(Math.max(...channels)).toBeLessThan(0x60);
    expect(Math.max(...channels)).toBeGreaterThan(0x10);
  });
});
