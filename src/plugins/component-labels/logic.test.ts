// The label build's stop behaviour (#185).
//
// The build is a short sequence of steps - one per label axis, then the
// optional grouping, then the optional extraction - and it only ever adds
// nodes, never removes one. That shape decides the stop policy: the run
// checks the token between steps (the pairing owned by `runUntilCancelled`)
// and reports which steps finished, so a stopped run leaves the labels it
// drew and none it did not. Two levels of test, mirroring the DS Template's:
// the wording is pure, and the stop decision itself is driven against a
// stand-in for the Figma API, because the steps loop is where the decision
// lives.

import { describe, it, expect, afterEach, vi } from "vitest";
import {
  describeStoppedLabelsBuild,
  executeBuildLabels,
  LABEL_STEP_ORDER,
} from "./logic";
import { createCancellationToken } from "../../shared/cancellation";

describe("describeStoppedLabelsBuild", () => {
  const ALL_PLANNED = LABEL_STEP_ORDER;

  it("names how far it got in steps, not percentages", () => {
    const message = describeStoppedLabelsBuild(["top", "left"], ALL_PLANNED);

    expect(message).toMatch(/top/);
    expect(message).toMatch(/left/);
  });

  it("says the drawn labels are still there and were not undone", () => {
    const message = describeStoppedLabelsBuild(["top"], ALL_PLANNED);

    // A stop is easy to read as "nothing happened". Labels exist on the
    // canvas, and the designer has to be told that first.
    expect(message).toMatch(/still on the canvas|still there/i);
    expect(message).toMatch(/not undone|were not removed/i);
  });

  it("warns that re-running adds labels rather than resuming", () => {
    // The build is additive: a second run draws a second set of labels
    // beside the first instead of completing it, so the instinctive re-run
    // needs the same warning the DS Template run gives.
    const message = describeStoppedLabelsBuild(["top"], ALL_PLANNED);

    expect(message).toMatch(/again/i);
    expect(message).toMatch(/delete|remove/i);
  });

  it("names every planned step that was not reached", () => {
    const message = describeStoppedLabelsBuild(["top", "left"], ALL_PLANNED);

    expect(message).toMatch(/second-top/);
    expect(message).toMatch(/second-left/);
  });

  it("never names a step the run was not planning to take", () => {
    // With no grouping asked for and no extraction, those two steps are not
    // in the plan - a report that listed them as "not drawn" would be
    // describing work nobody asked for.
    const message = describeStoppedLabelsBuild(
      ["top"],
      ["top", "left", "second-top", "second-left"],
    );

    expect(message).not.toMatch(/grouping/);
    expect(message).not.toMatch(/extract/);
  });

  it("is only ever about a run that stopped short", () => {
    expect(
      describeStoppedLabelsBuild(LABEL_STEP_ORDER, LABEL_STEP_ORDER),
    ).toBeNull();
  });
});

/**
 * `executeBuildLabels` against a stand-in for the Figma API.
 *
 * The stop decision lives in the steps loop, so this is the one place the
 * decision itself can be pinned without Figma. The stand-in covers exactly
 * what the build touches: font loading, text creation, and an element whose
 * children form a 2x2 variant grid. `extractToTheTop` sees an element with
 * no `absoluteBoundingBox` and returns early, which stands in for a set
 * already sitting at the top level.
 */
interface FakeTextNode {
  type: string;
  name: string;
  characters: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

function fakeFigma() {
  const textsCreated: FakeTextNode[] = [];
  const api = {
    loadFontAsync: async () => {},
    createText: () => {
      const node: FakeTextNode = {
        type: "TEXT",
        name: "label",
        characters: "",
        x: 0,
        y: 0,
        width: 40,
        height: 16,
      };
      textsCreated.push(node);
      return node;
    },
    currentPage: { appendChild: () => {} },
  };
  return { api, textsCreated: () => textsCreated };
}

function fakeElement() {
  // "Size" varies across columns, "State" down rows.
  const children = [
    { name: "Size=M, State=Rest", x: 0, y: 0, width: 100, height: 40 },
    { name: "Size=L, State=Rest", x: 200, y: 0, width: 100, height: 40 },
    { name: "Size=M, State=Hover", x: 0, y: 200, width: 100, height: 40 },
    { name: "Size=L, State=Hover", x: 200, y: 200, width: 100, height: 40 },
  ];
  return {
    type: "COMPONENT_SET" as const,
    name: "Buttons",
    id: "1:1",
    children,
    parent: { appendChild: () => {} },
    x: 0,
    y: 0,
    width: 300,
    height: 240,
  };
}

function baseOpts() {
  return {
    labels: {
      top: "Size",
      left: "State",
      secondTop: "",
      secondLeft: "",
      groupSecondTop: false,
      groupSecondLeft: false,
    },
    spacing: 16,
    fontSize: 12,
    extractElement: true,
  };
}

describe("executeBuildLabels", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("runs every planned step and draws the labels when nothing cancels it", async () => {
    const figma = fakeFigma();
    vi.stubGlobal("figma", figma.api);

    const outcome = await executeBuildLabels(
      fakeElement() as never,
      baseOpts(),
      createCancellationToken(),
    );

    expect(outcome.cancelled).toBe(false);
    // Grouping is unplanned here: both grouping flags are false, so the
    // conditional step is not in the plan at all.
    expect(outcome.plannedSteps).toEqual([
      "top",
      "left",
      "second-top",
      "second-left",
      "extract",
    ]);
    expect(outcome.completedSteps).toEqual(outcome.plannedSteps);
    // Two columns and two rows, labelled on both axes.
    expect(figma.textsCreated()).toHaveLength(4);
  });

  it("stops between whole steps: the axes after the stop are never drawn", async () => {
    const figma = fakeFigma();
    vi.stubGlobal("figma", figma.api);
    // Cancels on the second read - after the top step has run, before the
    // left step starts. `runUntilCancelled` reads the token once per step.
    let reads = 0;
    const token = {
      get isCancelled() {
        return ++reads >= 2;
      },
      cancel() {},
    };

    const outcome = await executeBuildLabels(
      fakeElement() as never,
      baseOpts(),
      token,
    );

    expect(outcome.cancelled).toBe(true);
    expect(outcome.completedSteps).toEqual(["top"]);
    // Only the top axis was drawn: two columns, one label each.
    expect(figma.textsCreated()).toHaveLength(2);
  });

  it("stops before the first step when already cancelled, drawing nothing", async () => {
    const figma = fakeFigma();
    vi.stubGlobal("figma", figma.api);
    const token = createCancellationToken();
    token.cancel();

    const outcome = await executeBuildLabels(
      fakeElement() as never,
      baseOpts(),
      token,
    );

    expect(outcome.cancelled).toBe(true);
    expect(outcome.completedSteps).toEqual([]);
    expect(figma.textsCreated()).toHaveLength(0);
  });
});
