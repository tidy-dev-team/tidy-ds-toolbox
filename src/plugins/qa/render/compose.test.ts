import { describe, it, expect } from "vitest";
import {
  boundCollectionIds,
  decideRelocate,
  stackTop,
  themesStatusOf,
} from "./compose";
import type { ThemeSnapshot } from "../snapshot";
import type { CheckResult } from "../types";

function result(checkId: string, status: CheckResult["status"]): CheckResult {
  return { checkId, title: checkId, status } as CheckResult;
}

describe("decideRelocate", () => {
  it("moves the checklist when an anchor was named", () => {
    expect(
      decideRelocate({
        anchorRequested: true,
        originId: null,
        targetId: "1:1",
      }),
    ).toBe(true);
  });

  it("moves the checklist when the run started at a placed node", () => {
    // A selected instance resolves up to its set, so origin and target differ.
    expect(
      decideRelocate({
        anchorRequested: false,
        originId: "9:9",
        targetId: "1:1",
      }),
    ).toBe(true);
  });

  it("leaves the checklist alone when the run targeted the set itself", () => {
    // An agent passing the set's id, or the set being selected: same node the
    // checklist is keyed on, so there is no placement intent to act on and the
    // designer's frame must not be dragged off the instance's page.
    expect(
      decideRelocate({
        anchorRequested: false,
        originId: "1:1",
        targetId: "1:1",
      }),
    ).toBe(false);
  });

  it("leaves the checklist alone on the name/glob path", () => {
    // No origin at all: nothing was pointed at, so nothing asked for a move.
    expect(
      decideRelocate({
        anchorRequested: false,
        originId: null,
        targetId: "1:1",
      }),
    ).toBe(false);
  });

  it("honours an explicit anchor even when it resolves to the target", () => {
    // Naming the anchor is a deliberate "put it here" whatever it points at.
    expect(
      decideRelocate({
        anchorRequested: true,
        originId: "1:1",
        targetId: "1:1",
      }),
    ).toBe(true);
  });
});

describe("stackTop", () => {
  const GAP = 32;

  it("starts the first block level with the checklist", () => {
    expect(stackTop([], GAP)).toBe(0);
  });

  it("puts a block below the one placed above it, plus the gap", () => {
    expect(stackTop([100], GAP)).toBe(132);
  });

  it("accumulates every block already placed", () => {
    expect(stackTop([100, 50], GAP)).toBe(214);
  });

  it("gives a block that was not drawn no share of the stack", () => {
    // Absence is expressed by not being in the list, which is what keeps the
    // common case - a healthy component draws no evidence block - from leaving
    // a gap where nothing stands.
    expect(stackTop([100], GAP)).toBe(stackTop([100], GAP));
    expect(stackTop([], GAP)).toBe(0);
  });
});

describe("themesStatusOf", () => {
  it("finds the themes row's status", () => {
    expect(
      themesStatusOf([result("tokens", "pass"), result("themes", "warn")]),
    ).toBe("warn");
  });

  it("is undefined when the run did not evaluate themes", () => {
    // A filtered run: the showcase treats this as "no opinion", not a refusal.
    expect(themesStatusOf([result("tokens", "pass")])).toBeUndefined();
  });
});

describe("boundCollectionIds", () => {
  function theme(collectionIds: string[]): ThemeSnapshot {
    return {
      collectionId: "c1",
      modes: [],
      variables: Object.fromEntries(
        collectionIds.map((collectionId, i) => [
          `v${i}`,
          { collectionId, valuesByMode: {} },
        ]),
      ),
    } as unknown as ThemeSnapshot;
  }

  it("lists every collection the set binds", () => {
    expect(boundCollectionIds(theme(["c1", "c2"]))).toEqual(["c1", "c2"]);
  });

  it("names a collection once however many variables come from it", () => {
    expect(boundCollectionIds(theme(["c1", "c1", "c2"]))).toEqual(["c1", "c2"]);
  });

  it("is empty when the run resolved no theme", () => {
    expect(boundCollectionIds(undefined)).toEqual([]);
  });
});
