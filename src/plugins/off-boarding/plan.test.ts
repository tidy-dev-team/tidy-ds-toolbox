import { describe, expect, it } from "vitest";

import {
  describePlan,
  FileInventory,
  PageSummary,
  PackManifest,
  planPack,
  planUnpack,
  TempPageSummary,
  TEMP_PAGE_NAME,
} from "./plan";

function page(name: string, topLevelNodeCount = 3): PageSummary {
  return { id: `id-${name}`, name, topLevelNodeCount };
}

function manifest(...names: string[]): PackManifest {
  return {
    version: 1,
    packedAt: "2026-08-30T00:00:00.000Z",
    pages: names.map((name) => ({ name })),
  };
}

function temp(overrides: Partial<TempPageSummary> = {}): TempPageSummary {
  return {
    id: "id-temp",
    name: TEMP_PAGE_NAME,
    marked: true,
    frames: [{ restoresToPageName: "Home" }],
    manifest: manifest("Home"),
    ...overrides,
  };
}

function inventory(overrides: Partial<FileInventory> = {}): FileInventory {
  return {
    pages: [page("Home"), page("About")],
    tempCandidates: [],
    ...overrides,
  };
}

describe("planPack", () => {
  it("packs every page when nothing is selected", () => {
    const plan = planPack(inventory(), []);
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.pages.map((p) => p.name)).toEqual(["Home", "About"]);
    expect(plan.tempPage).toEqual({ action: "create" });
  });

  it("packs only the selected pages, in inventory order", () => {
    const plan = planPack(inventory(), ["id-About"]);
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.pages.map((p) => p.name)).toEqual(["About"]);
  });

  it("refuses when a selection matches nothing, rather than packing everything", () => {
    // A selection that matches nothing is not the same as no selection: the
    // designer asked for something specific and did not get it.
    const plan = planPack(inventory(), ["id-Gone"]);
    expect(plan.ok).toBe(false);
    if (plan.ok) return;
    expect(plan.code).toBe("no-pages-selected");
  });

  it("refuses when the file has no pages", () => {
    const plan = planPack(inventory({ pages: [] }), []);
    expect(plan.ok).toBe(false);
    if (plan.ok) return;
    expect(plan.code).toBe("no-pages-selected");
  });

  it("reuses a temporary page that carries our marker", () => {
    const plan = planPack(inventory({ tempCandidates: [temp()] }), []);
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.tempPage).toEqual({ action: "reuse", id: "id-temp" });
  });

  it("refuses to clear a page that holds the name but not the marker", () => {
    // The defect this exists for: the old code identified the temporary page by
    // NAME and deleted every child of any page carrying it.
    const plan = planPack(
      inventory({ tempCandidates: [temp({ marked: false })] }),
      [],
    );
    expect(plan.ok).toBe(false);
    if (plan.ok) return;
    expect(plan.code).toBe("temp-name-taken");
    expect(plan.message).toContain("will not be cleared");
  });

  it("prefers our marked page when an unmarked one shares the name", () => {
    const plan = planPack(
      inventory({
        tempCandidates: [
          temp({ id: "id-theirs", marked: false }),
          temp({ id: "id-ours", marked: true }),
        ],
      }),
      [],
    );
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.tempPage).toEqual({ action: "reuse", id: "id-ours" });
  });

  it("names empty pages rather than dropping them", () => {
    const plan = planPack(
      inventory({ pages: [page("Home"), page("Scratch", 0)] }),
      [],
    );
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.emptyPageNames).toEqual(["Scratch"]);
    expect(plan.pages).toHaveLength(2);
  });

  it("keeps two pages with the same name as two pages", () => {
    const duplicate: PageSummary[] = [
      { id: "a", name: "Icons", topLevelNodeCount: 1 },
      { id: "b", name: "Icons", topLevelNodeCount: 1 },
    ];
    const plan = planPack(inventory({ pages: duplicate }), []);
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.pages.map((p) => p.id)).toEqual(["a", "b"]);
  });
});

describe("planUnpack", () => {
  it("restores the names the manifest recorded, in its order", () => {
    const plan = planUnpack(
      inventory({
        tempCandidates: [
          temp({
            frames: [
              { restoresToPageName: "wrong-1" },
              { restoresToPageName: "wrong-2" },
            ],
            manifest: manifest("Home", "About"),
          }),
        ],
      }),
    );
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.pageNames).toEqual(["Home", "About"]);
    expect(plan.namesFromFramesOnly).toBe(false);
  });

  it("refuses when there is no packed page, instead of using the current page", () => {
    // The worst defect in the module: a designer who packed, deleted the
    // temporary page by hand and clicked Unpack to undo got the page they were
    // looking at taken apart into new pages.
    const plan = planUnpack(inventory());
    expect(plan.ok).toBe(false);
    if (plan.ok) return;
    expect(plan.code).toBe("no-packed-page");
    expect(plan.message).toContain("will not take apart the page");
  });

  it("refuses a page that holds the name but not the marker", () => {
    const plan = planUnpack(
      inventory({ tempCandidates: [temp({ marked: false })] }),
    );
    expect(plan.ok).toBe(false);
    if (plan.ok) return;
    expect(plan.code).toBe("temp-name-taken");
  });

  it("refuses a marked page with no packed frames", () => {
    const plan = planUnpack(
      inventory({ tempCandidates: [temp({ frames: [], manifest: null })] }),
    );
    expect(plan.ok).toBe(false);
    if (plan.ok) return;
    expect(plan.code).toBe("packed-page-empty");
  });

  it("falls back to the frames' own names when there is no manifest", () => {
    // A page packed by a build older than #155 carries no manifest. It still
    // unpacks; the designer is told where the names came from.
    const plan = planUnpack(
      inventory({
        tempCandidates: [
          temp({
            frames: [
              { restoresToPageName: "Home" },
              { restoresToPageName: "About" },
            ],
            manifest: null,
          }),
        ],
      }),
    );
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.pageNames).toEqual(["Home", "About"]);
    expect(plan.namesFromFramesOnly).toBe(true);
  });

  it("trusts the frames when the manifest disagrees about how many there are", () => {
    // The frames are what actually exists. A manifest naming a different number
    // means the packed page was edited by hand after packing.
    const plan = planUnpack(
      inventory({
        tempCandidates: [
          temp({
            frames: [{ restoresToPageName: "Home" }],
            manifest: manifest("Home", "About"),
          }),
        ],
      }),
    );
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.pageNames).toEqual(["Home"]);
    expect(plan.namesFromFramesOnly).toBe(true);
  });

  it("round-trips two pages that share a name", () => {
    const plan = planUnpack(
      inventory({
        tempCandidates: [
          temp({
            frames: [
              { restoresToPageName: "Icons" },
              { restoresToPageName: "Icons" },
            ],
            manifest: manifest("Icons", "Icons"),
          }),
        ],
      }),
    );
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.pageNames).toEqual(["Icons", "Icons"]);
  });
});

describe("describePlan", () => {
  it("states the count and names for a pack, so a wrong run is obvious", () => {
    const plan = planPack(inventory(), []);
    if (!plan.ok) throw new Error("expected a plan");
    expect(describePlan(plan)).toBe(
      `Pack 2 pages into "${TEMP_PAGE_NAME}": Home, About.`,
    );
  });

  it("calls out empty pages in the confirmation", () => {
    const plan = planPack(
      inventory({ pages: [page("Home"), page("Scratch", 0)] }),
      [],
    );
    if (!plan.ok) throw new Error("expected a plan");
    expect(describePlan(plan)).toContain("Scratch");
    expect(describePlan(plan)).toContain("empty");
  });

  it("states how many pages an unpack will create", () => {
    const plan = planUnpack(
      inventory({
        tempCandidates: [
          temp({
            frames: [
              { restoresToPageName: "Home" },
              { restoresToPageName: "About" },
            ],
            manifest: manifest("Home", "About"),
          }),
        ],
      }),
    );
    if (!plan.ok) throw new Error("expected a plan");
    expect(describePlan(plan)).toBe(
      "Create 2 pages from the packed page: Home, About.",
    );
  });

  it("says when unpack names came from the frames rather than a record", () => {
    const plan = planUnpack(
      inventory({
        tempCandidates: [
          temp({ frames: [{ restoresToPageName: "Home" }], manifest: null }),
        ],
      }),
    );
    if (!plan.ok) throw new Error("expected a plan");
    expect(describePlan(plan)).toContain("no record of what was packed");
  });

  it("uses the singular for one page", () => {
    const plan = planPack(inventory({ pages: [page("Home")] }), []);
    if (!plan.ok) throw new Error("expected a plan");
    expect(describePlan(plan)).toContain("Pack 1 page into");
  });
});
