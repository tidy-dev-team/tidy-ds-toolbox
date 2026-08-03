import { describe, expect, it } from "vitest";
import type { ClearCanvasCandidate } from "../types";
import {
  defaultClearCanvasSelection,
  planClearCanvasDeletion,
} from "./clearCanvas";

function candidate(
  overrides: Partial<ClearCanvasCandidate> = {},
): ClearCanvasCandidate {
  return {
    id: "stamped-id",
    name: "Release note card",
    pageName: "Components",
    ownership: "verified-stamped",
    ...overrides,
  };
}

describe("Clear Canvas selection", () => {
  it("does not plan an unconfirmed legacy-name match for deletion", () => {
    const candidates = [
      candidate(),
      candidate({
        id: "legacy-id",
        name: "Buttons-release-notes",
        ownership: "unverified-legacy-name",
      }),
    ];

    const selected = defaultClearCanvasSelection(candidates);

    expect(planClearCanvasDeletion(candidates, selected)).toEqual([
      "stamped-id",
    ]);
  });

  it("plans the exact selected ID when matching legacy rows look identical", () => {
    const generated = candidate({
      id: "generated-id",
      name: "Buttons-release-notes",
      ownership: "unverified-legacy-name",
    });
    const designerOwned = candidate({
      id: "designer-owned-id",
      name: "Buttons-release-notes",
      ownership: "unverified-legacy-name",
    });

    expect(
      planClearCanvasDeletion([generated, designerOwned], [designerOwned.id]),
    ).toEqual([designerOwned.id]);
  });

  it("plans a selected legacy-name match for deletion", () => {
    const legacy = candidate({
      id: "legacy-id",
      name: "Buttons-release-notes",
      ownership: "unverified-legacy-name",
    });

    expect(planClearCanvasDeletion([legacy], [legacy.id])).toEqual([legacy.id]);
  });

  it("plans a selected stamped card for deletion", () => {
    const stamped = candidate();

    expect(planClearCanvasDeletion([stamped], [stamped.id])).toEqual([
      stamped.id,
    ]);
  });

  it("skips stale and renamed candidates after the preview", () => {
    const selectedAtPreview = [
      candidate({
        id: "stale-id",
        name: "client-release-notes",
        ownership: "unverified-legacy-name",
      }),
      candidate({
        id: "renamed-id",
        name: "Buttons-release-notes",
        ownership: "unverified-legacy-name",
      }),
      candidate({ id: "kept-id" }),
    ];
    const currentCandidates = [candidate({ id: "kept-id" })];

    expect(
      planClearCanvasDeletion(
        currentCandidates,
        selectedAtPreview.map((item) => item.id),
      ),
    ).toEqual(["kept-id"]);
  });
});
