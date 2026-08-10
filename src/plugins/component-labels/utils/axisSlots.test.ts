import { describe, expect, it } from "vitest";

import { AxisBox, chooseSlotValue, collectAxisSlots } from "./axisSlots";
import { extractVariantValue } from "./variantValue";

interface Cell extends AxisBox {
  name: string;
}

const CELL_WIDTH = 100;
const CELL_HEIGHT = 40;
const GAP = 20;

function cell(column: number, row: number, name: string): Cell {
  return {
    name,
    x: column * (CELL_WIDTH + GAP),
    y: row * (CELL_HEIGHT + GAP),
    width: CELL_WIDTH,
    height: CELL_HEIGHT,
  };
}

/**
 * The set from #175: "Selected step" only runs up to "Total steps", so the
 * grid is a triangle. Column 0 holds two rows; the last column holds six.
 */
function raggedStepperSet(): Cell[] {
  const cells: Cell[] = [];
  for (let totalSteps = 2; totalSteps <= 6; totalSteps += 1) {
    for (let selected = 1; selected <= totalSteps; selected += 1) {
      cells.push(
        cell(
          totalSteps - 2,
          selected - 1,
          `Total steps=${totalSteps}, Selected step=${selected}`,
        ),
      );
    }
  }
  return cells;
}

function fullGrid(): Cell[] {
  const cells: Cell[] = [];
  for (let column = 0; column < 3; column += 1) {
    for (let row = 0; row < 2; row += 1) {
      cells.push(
        cell(column, row, `Size=${["s", "m", "l"][column]}, State=${row}`),
      );
    }
  }
  return cells;
}

function labelsFor(cells: Cell[], axis: "x" | "y", property: string) {
  return collectAxisSlots(cells, axis).map(
    (slot) =>
      chooseSlotValue(slot, (node) => extractVariantValue(node.name, property))
        ?.value ?? null,
  );
}

describe("collectAxisSlots", () => {
  it("finds every row of a ragged set, not only the rows of its first column", () => {
    const slots = collectAxisSlots(raggedStepperSet(), "y");

    expect(slots).toHaveLength(6);
    expect(slots.map((slot) => slot.nodes.length)).toEqual([5, 5, 4, 3, 2, 1]);
  });

  it("finds every column of a ragged set", () => {
    const slots = collectAxisSlots(raggedStepperSet(), "x");

    expect(slots).toHaveLength(5);
    expect(slots.map((slot) => slot.nodes.length)).toEqual([2, 3, 4, 5, 6]);
  });

  it("centres a slot on the band, near edge first", () => {
    const slots = collectAxisSlots(fullGrid(), "x");

    expect(slots.map((slot) => slot.start)).toEqual([0, 120, 240]);
    expect(slots.map((slot) => slot.end)).toEqual([100, 220, 340]);
    expect(slots.map((slot) => slot.center)).toEqual([50, 170, 290]);
  });

  it("keeps a cell of a different size in its band", () => {
    const tall = { x: 0, y: 0, width: CELL_WIDTH, height: CELL_HEIGHT * 1.5 };
    const short = { x: 120, y: 0, width: CELL_WIDTH, height: CELL_HEIGHT / 2 };
    const next = { x: 0, y: 60, width: CELL_WIDTH, height: CELL_HEIGHT };

    const slots = collectAxisSlots([tall, short, next], "y");

    expect(slots).toHaveLength(2);
    expect(slots[0].nodes).toEqual([tall, short]);
    expect(slots[1].nodes).toEqual([next]);
  });

  it("does not let one tall cell swallow the rows below it", () => {
    const tall = { x: 0, y: 0, width: CELL_WIDTH, height: 500 };
    const rows = [60, 120, 180].map((y) => ({
      x: 120,
      y,
      width: CELL_WIDTH,
      height: CELL_HEIGHT,
    }));

    const slots = collectAxisSlots([tall, ...rows], "y");

    expect(slots).toHaveLength(4);
  });

  it("returns nothing for an empty set", () => {
    expect(collectAxisSlots([], "x")).toEqual([]);
  });

  it("leaves the caller's array untouched", () => {
    const cells = [cell(1, 0, "b"), cell(0, 0, "a")];
    collectAxisSlots(cells, "x");

    expect(cells.map((c) => c.name)).toEqual(["b", "a"]);
  });
});

describe("chooseSlotValue", () => {
  it("labels every row of the ragged set with its own step", () => {
    expect(labelsFor(raggedStepperSet(), "y", "Selected step")).toEqual([
      "1",
      "2",
      "3",
      "4",
      "5",
      "6",
    ]);
  });

  it("labels every column of the ragged set", () => {
    expect(labelsFor(raggedStepperSet(), "x", "Total steps")).toEqual([
      "2",
      "3",
      "4",
      "5",
      "6",
    ]);
  });

  it("still labels a full rectangular grid", () => {
    expect(labelsFor(fullGrid(), "x", "Size")).toEqual(["s", "m", "l"]);
    expect(labelsFor(fullGrid(), "y", "State")).toEqual(["0", "1"]);
  });

  it("takes the value most of the band agrees on", () => {
    const slot = collectAxisSlots(
      [
        cell(0, 0, "State=hover"),
        cell(1, 0, "State=default"),
        cell(2, 0, "State=default"),
      ],
      "y",
    )[0];

    expect(
      chooseSlotValue(slot, (node) => extractVariantValue(node.name, "State")),
    ).toMatchObject({ value: "default" });
  });

  it("reports nothing when no node in the band carries the property", () => {
    const slot = collectAxisSlots([cell(0, 0, "Size=s")], "y")[0];

    expect(
      chooseSlotValue(slot, (node) => extractVariantValue(node.name, "State")),
    ).toBeNull();
  });
});
