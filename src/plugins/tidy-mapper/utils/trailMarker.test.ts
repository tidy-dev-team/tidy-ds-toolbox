import { describe, it, expect } from "vitest";
import {
  setTrailsVisibility,
  showTrailsByName,
  getTrailNames,
} from "./trailMarker";
import { TRAIL_SUFFIX } from "./constants";

function makeTrail(name: string, visible = false) {
  return { type: "FRAME", name: `${name}${TRAIL_SUFFIX}`, visible };
}

function makePage(children: unknown[]) {
  return {
    findChildren: (predicate: (n: any) => boolean) =>
      children.filter(predicate),
  } as unknown as PageNode;
}

describe("setTrailsVisibility", () => {
  it("sets every trail marker to the given visibility and returns the count", () => {
    const avatar = makeTrail("Avatar", false);
    const badge = makeTrail("Badge", false);
    const page = makePage([avatar, badge, { type: "FRAME", name: "Other" }]);

    const count = setTrailsVisibility(page, true);

    expect(count).toBe(2);
    expect(avatar.visible).toBe(true);
    expect(badge.visible).toBe(true);
  });

  it("ignores non-trail frames", () => {
    const notTrail = { type: "FRAME", name: "Content", visible: false };
    const page = makePage([notTrail]);

    setTrailsVisibility(page, true);

    expect(notTrail.visible).toBe(false);
  });
});

describe("showTrailsByName", () => {
  it("shows only trails whose name starts with the given prefix, hiding the rest", () => {
    const avatar = makeTrail("Avatar", false);
    const avatarNumber = makeTrail("Avatar Number", true);
    const badge = makeTrail("Badge", true);
    const page = makePage([avatar, avatarNumber, badge]);

    const count = showTrailsByName(page, "Avatar");

    expect(count).toBe(2);
    expect(avatar.visible).toBe(true);
    expect(avatarNumber.visible).toBe(true);
    expect(badge.visible).toBe(false);
  });

  it("hides every trail and returns 0 when nothing matches", () => {
    const avatar = makeTrail("Avatar", true);
    const page = makePage([avatar]);

    const count = showTrailsByName(page, "Nonexistent");

    expect(count).toBe(0);
    expect(avatar.visible).toBe(false);
  });
});

describe("getTrailNames", () => {
  it("strips the trail suffix and returns unique names, sorted", () => {
    const page = makePage([
      makeTrail("Badge"),
      makeTrail("Avatar"),
      makeTrail("Avatar"),
    ]);

    expect(getTrailNames(page)).toEqual(["Avatar", "Badge"]);
  });

  it("returns an empty array when there are no trails", () => {
    expect(getTrailNames(makePage([]))).toEqual([]);
  });
});
