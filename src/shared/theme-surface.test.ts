import { describe, it, expect } from "vitest";
import {
  isDarkModeName,
  neutralSurfaceFill,
  polarityModeId,
} from "./theme-surface";

function collection(...names: string[]) {
  return { modes: names.map((name, i) => ({ modeId: `m${i}`, name })) };
}

describe("polarityModeId", () => {
  it("finds the light and dark modes of a collection", () => {
    const modes = collection("Light", "Dark");

    expect(polarityModeId(modes, false)).toBe("m0");
    expect(polarityModeId(modes, true)).toBe("m1");
  });

  it("reads the polarity out of a longer mode name", () => {
    // The case this exists for: the theme collection names its modes by brand and
    // polarity together, and the surface token's own collection has to be pinned
    // to match.
    const modes = collection("Industrial Light", "Industrial Dark");

    expect(polarityModeId(modes, true)).toBe("m1");
  });

  // Substring matching resolved a request for light to "Highlight", which pins an
  // unrelated mode - and does it silently, since everything still renders, just
  // against the wrong theme.
  it("does not match a polarity word inside another word", () => {
    const modes = collection("Highlight", "Light", "Dark");

    expect(polarityModeId(modes, false)).toBe("m1");
  });

  it("returns null when the collection has no such polarity", () => {
    const modes = collection("Compact", "Comfortable");

    expect(polarityModeId(modes, true)).toBeNull();
    expect(polarityModeId(modes, false)).toBeNull();
  });
});

describe("isDarkModeName", () => {
  it.each(["Dark", "dark mode", "Industrial Dark", "night"])(
    "reads %s as dark",
    (name) => {
      expect(isDarkModeName(name)).toBe(true);
    },
  );

  it.each(["Light", "Darkness", "Darjeeling", "Compact"])(
    "does not read %s as dark",
    (name) => {
      expect(isDarkModeName(name)).toBe(false);
    },
  );
});

describe("neutralSurfaceFill", () => {
  // tidy-doc's approximation when a DS exposes no surface token: it is
  // reproducing a theme, so a light-named mode wants a pale surface. QA's
  // showcase deliberately does *not* use this - see FALLBACK_STAGE.
  it("approximates a pale surface for a light mode and a dark one for dark", () => {
    const light = neutralSurfaceFill("Industrial Light");
    const dark = neutralSurfaceFill("Industrial Dark");

    expect(light.color.r).toBeGreaterThan(dark.color.r);
    expect(light.type).toBe("SOLID");
  });

  it("treats an unreadable mode name as light, as tidy-doc's cards expect", () => {
    expect(neutralSurfaceFill("Compact")).toEqual(neutralSurfaceFill("Light"));
  });
});
