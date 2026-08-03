import { describe, it, expect } from "vitest";
import { componentCardPosition, pageEdgeCardPosition } from "./placement";

describe("pageEdgeCardPosition", () => {
  it("puts the card at the origin on an empty page", () => {
    expect(pageEdgeCardPosition([], 560, 100)).toEqual({ x: 0, y: 0 });
  });

  it("sits left of the leftmost frame, aligned to the topmost", () => {
    const position = pageEdgeCardPosition(
      [
        { x: 400, y: 300 },
        { x: 1200, y: 120 },
        { x: 900, y: 800 },
      ],
      560,
      100,
    );

    expect(position).toEqual({ x: 400 - 560 - 100, y: 120 });
  });

  it("handles content already at negative coordinates", () => {
    expect(pageEdgeCardPosition([{ x: -2000, y: -50 }], 560, 100)).toEqual({
      x: -2660,
      y: -50,
    });
  });

  it("does not drift when re-run with the same siblings", () => {
    const siblings = [{ x: 0, y: 0 }];
    const first = pageEdgeCardPosition(siblings, 560, 100);
    const second = pageEdgeCardPosition(siblings, 560, 100);

    // The caller excludes the card itself, so a second publish lands in the
    // same place rather than stepping further left.
    expect(second).toEqual(first);
  });

  it("stacks two cards on one page, and lands both in the same place twice", () => {
    // Two nested Subjects can share a page. The second card counts the first,
    // so they stack leftward instead of overlapping. Publishing again starts
    // from the same content, because the caller takes every card the run
    // rebuilds off the page before measuring any of them. Clearing them one at
    // a time drifted the pair 1320px left on every publish.
    const content = [{ x: 0, y: 0 }];

    const first = pageEdgeCardPosition(content, 560, 100);
    const second = pageEdgeCardPosition([...content, first], 560, 100);
    expect([first, second]).toEqual([
      { x: -660, y: 0 },
      { x: -1320, y: 0 },
    ]);

    const republished = pageEdgeCardPosition(content, 560, 100);
    expect(republished).toEqual(first);
  });

  it("clears the frame a nested component lives in, not the component", () => {
    // A component inside a documentation frame gets this rule rather than
    // componentCardPosition, so the card clears the frame instead of landing
    // inside it. Only page children are measured, so the component's own
    // frame-relative offset never reaches the sum.
    const documentationFrame = { x: 0, y: 0 };

    expect(pageEdgeCardPosition([documentationFrame], 560, 100)).toEqual({
      x: -660,
      y: 0,
    });
  });
});

describe("componentCardPosition", () => {
  it("sits immediately left of the set, tops aligned", () => {
    expect(componentCardPosition({ x: 1000, y: 250 }, 560, 100)).toEqual({
      x: 340,
      y: 250,
    });
  });
});
