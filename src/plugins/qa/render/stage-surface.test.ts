import { describe, it, expect } from "vitest";
import { fallbackStage, NEUTRAL_DARK, surfaceCaption } from "./stage-surface";

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
    // Nor claim one tone for every mode. That is what it used to paint, and on a
    // collection whose modes are brands rather than polarities it invented a dark
    // theme the file did not have. A caption outliving the behaviour it describes
    // is how a false one shipped before.
    expect(caption).not.toMatch(/every mode gets the same/i);
    // And must say that most modes get nothing behind them, because a caption
    // implying a backdrop where there is none is the same failure in reverse.
    expect(caption).toMatch(/nothing added behind it/i);
  });
});

describe("fallbackStage", () => {
  // The default is *nothing*. A pale box behind a light-mode component is a
  // surface the component does not have, and it reads as part of the component -
  // which is exactly how a grey stage got mistaken for the component's own
  // background. The card is already the surface these sit on.
  it.each(["Isracard", "Amex", "Isracard-Orange", "Isracard-purple", "Light"])(
    "adds no backdrop for %s",
    (name) => {
      expect(fallbackStage(name)).toBeNull();
    },
  );

  // The one case where doing nothing is wrong: a dark-mode component judged
  // against the white card is misrepresented just as badly.
  it.each(["Industrial Dark", "night_mode", "Dark"])(
    "backs %s with a neutral dark",
    (name) => {
      expect(fallbackStage(name)).toBe(NEUTRAL_DARK);
    },
  );

  // It sits behind arbitrary components, so any colour cast reads as belonging to
  // the component. Borrowing tidy-doc's cool grey made a blue-accented slider
  // look like it had a lavender background of its own.
  it("is achromatic", () => {
    const [r, g, b] = [1, 3, 5].map((at) =>
      parseInt(NEUTRAL_DARK.slice(at, at + 2), 16),
    );

    expect(r).toBe(g);
    expect(g).toBe(b);
  });
});
