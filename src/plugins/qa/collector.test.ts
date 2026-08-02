/**
 * The pure seam of the collector (issue #124).
 *
 * `collector.ts` is one of the deliberately figma-touching files, so most of it
 * is exercised only by loading the plugin. `textSegmentSnapshots` is carved out
 * of that because it is the piece that decides what the contrast check will
 * see: get the mapping wrong and a coloured link is either invisible again or
 * measured against the wrong colour, and nothing downstream can tell.
 *
 * The fixtures are typed as `StyledFillRun`, which is a `Pick` of Figma's own
 * `StyledTextSegment`. That is the point - a fixture that drifts from what
 * `getStyledTextSegments` actually returns stops compiling.
 */

import { describe, it, expect } from "vitest";
import { textSegmentSnapshots } from "./collector";
import type { StyledFillRun } from "./collector";

function solidPaint(
  r: number,
  g: number,
  b: number,
  extra: Partial<SolidPaint> = {},
): SolidPaint {
  return { type: "SOLID", color: { r, g, b }, ...extra };
}

function run(overrides: Partial<StyledFillRun> = {}): StyledFillRun {
  return {
    fills: [solidPaint(0, 0, 0)],
    fillStyleId: "",
    fontSize: 16,
    fontWeight: 400,
    ...overrides,
  };
}

describe("textSegmentSnapshots", () => {
  it("gives each run its own colour, size and style", () => {
    const result = textSegmentSnapshots([
      run(),
      run({
        fills: [solidPaint(0.6, 0.6, 0.6)],
        fillStyleId: "S:link",
        fontSize: 24,
      }),
    ]);
    expect(result).toEqual([
      {
        fills: [{ type: "SOLID", visible: true, opacity: 1, hex: "#000000" }],
        fillStyleId: "",
        fontSize: 16,
      },
      {
        fills: [{ type: "SOLID", visible: true, opacity: 1, hex: "#999999" }],
        fillStyleId: "S:link",
        fontSize: 24,
      },
    ]);
  });

  it("marks a run bold only from 700, so the lenient threshold is earned", () => {
    const result = textSegmentSnapshots([
      run({ fontWeight: 600 }),
      run({ fontWeight: 700 }),
    ]);
    expect(result?.[0].bold).toBeUndefined();
    expect(result?.[1].bold).toBe(true);
  });

  it("carries a run's bound colour variable through", () => {
    // Without the binding the check cannot resolve the run per theme mode, and
    // a link that fails in one mode only would never be reported.
    const result = textSegmentSnapshots([
      run({
        fills: [
          solidPaint(0.35, 0.35, 0.35, {
            boundVariables: { color: { type: "VARIABLE_ALIAS", id: "v-link" } },
          }),
        ],
      }),
    ]);
    expect(result?.[0].fills?.[0].boundVariableId).toBe("v-link");
  });

  it("keeps a run's paint opacity and hidden flag", () => {
    const result = textSegmentSnapshots([
      run({
        fills: [
          solidPaint(0, 0, 0, { opacity: 0.3 }),
          solidPaint(1, 1, 1, { visible: false }),
        ],
      }),
    ]);
    expect(result?.[0].fills).toEqual([
      { type: "SOLID", visible: true, opacity: 0.3, hex: "#000000" },
      { type: "SOLID", visible: false, opacity: 1, hex: "#FFFFFF" },
    ]);
  });

  it("records a non-solid run without inventing a colour for it", () => {
    // A gradient run has no single colour. It must still arrive, so the check
    // can say it could not measure that part rather than skipping it silently.
    const gradient: GradientPaint = {
      type: "GRADIENT_LINEAR",
      gradientTransform: [
        [1, 0, 0],
        [0, 1, 0],
      ],
      gradientStops: [],
    };
    const result = textSegmentSnapshots([run({ fills: [gradient] })]);
    expect(result?.[0].fills).toEqual([
      { type: "GRADIENT_LINEAR", visible: true, opacity: 1 },
    ]);
  });

  it("reports a run that paints nothing as an empty fill list", () => {
    const result = textSegmentSnapshots([run({ fills: [] })]);
    expect(result?.[0].fills).toEqual([]);
  });

  it("returns undefined when there are no runs at all", () => {
    // Figma returns no segments for an empty text layer. There is nothing to
    // measure, and the check reports the layer as unevaluated.
    expect(textSegmentSnapshots([])).toBeUndefined();
  });
});
