import { describe, it, expect } from "vitest";
import { FALLBACK_STAGE, surfaceCaption } from "./stage-surface";

describe("surfaceCaption", () => {
  // Naming the token is how a wrong backdrop reads as a wrong backdrop rather
  // than as a broken component - #127's lesson, and the thing that let a bad
  // pick be diagnosed rather than believed.
  it("names the token the backdrop was bound to", () => {
    expect(surfaceCaption("bg/surface")).toContain("bg/surface");
    expect(surfaceCaption("bg/surface")).toMatch(/resolved per mode/i);
  });

  it("says what the fallback actually does, without a token", () => {
    const caption = surfaceCaption(undefined);

    expect(caption).toMatch(/no surface token/i);
    // Must not imply it is the real surface, since a reader would then draw
    // contrast conclusions the picture does not support.
    expect(caption).not.toMatch(/resolved per mode/i);
    // Nor imply the backdrop varies by mode: it does not, and an earlier version
    // of this caption said it was "approximated from each mode's name" while the
    // code returned one constant. A caption that describes behaviour the drawing
    // does not have is worse than no caption.
    expect(caption).not.toMatch(/from (each|the) mode's name/i);
    expect(caption).toMatch(/every mode gets the same/i);
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
