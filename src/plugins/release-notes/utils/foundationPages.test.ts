import { describe, it, expect } from "vitest";
import {
  isDividerName,
  dividerLabel,
  findFoundationPages,
  type PageRef,
} from "./foundationPages";

function pages(...names: string[]): PageRef[] {
  return names.map((name, index) => ({ id: `${index}:0`, name }));
}

/** The page list of the Kido DS file this was built against. */
const REAL_FILE = pages(
  "🕐 Waiting Room",
  "———— 🛠 Foundation ————",
  "↳ 🟡 Breakpoints",
  "↳ 🟡 Colors",
  "↳ 🟢 Elevation",
  "↳ 🔵 Gradiants",
  "↳ 🟣 Icons",
  "↳ 🟡 Logo",
  "↳ 🔵 Rounded corners",
  "↳ 🔵 Spacing and Grids",
  "↳ 🟡 Typography",
  "———— 🧰 Components ————",
  "🟡 Buttons",
  "⚪ Accordion",
);

describe("isDividerName", () => {
  it.each([
    "———— 🛠 Foundation ————",
    "---- Components ----",
    "－－－－",
    "─────── Assets ───────",
    "___ Archive ___",
  ])("treats %s as a divider", (name) => {
    expect(isDividerName(name)).toBe(true);
  });

  it.each(["↳ 🟡 Breakpoints", "Buttons", "Waiting Room", "A-B-C", "Colors"])(
    "treats %s as a normal page",
    (name) => {
      expect(isDividerName(name)).toBe(false);
    },
  );
});

describe("dividerLabel", () => {
  it("keeps only the readable middle", () => {
    expect(dividerLabel("———— 🛠 Foundation ————")).toBe("🛠 Foundation");
    expect(dividerLabel("---- Components ----")).toBe("Components");
  });

  it("is empty for a bare divider", () => {
    expect(dividerLabel("————————")).toBe("");
  });
});

describe("findFoundationPages", () => {
  it("takes the run between the Foundation divider and the next one", () => {
    const result = findFoundationPages(REAL_FILE);

    expect(result.source).toBe("foundation-divider");
    expect(result.pages.map((page) => page.name)).toEqual([
      "↳ 🟡 Breakpoints",
      "↳ 🟡 Colors",
      "↳ 🟢 Elevation",
      "↳ 🔵 Gradiants",
      "↳ 🟣 Icons",
      "↳ 🟡 Logo",
      "↳ 🔵 Rounded corners",
      "↳ 🔵 Spacing and Grids",
      "↳ 🟡 Typography",
    ]);
  });

  it("excludes what sits above the divider", () => {
    const result = findFoundationPages(REAL_FILE);
    expect(result.pages.map((page) => page.name)).not.toContain(
      "🕐 Waiting Room",
    );
  });

  it("runs to the end of the file when no divider follows", () => {
    const result = findFoundationPages(
      pages("Cover", "--- Foundation ---", "Colors", "Type"),
    );

    expect(result.pages.map((page) => page.name)).toEqual(["Colors", "Type"]);
  });

  it("reports an empty area when the divider is the last page", () => {
    const result = findFoundationPages(pages("Cover", "--- Foundation ---"));

    // The area exists and is empty: that is not the same as having no
    // Foundation area at all, so it must not fall back to every page.
    expect(result.source).toBe("foundation-divider");
    expect(result.pages).toEqual([]);
  });

  it("reports an empty area when the next divider follows immediately", () => {
    const result = findFoundationPages(
      pages("--- Foundation ---", "--- Components ---", "Buttons"),
    );

    expect(result.source).toBe("foundation-divider");
    expect(result.pages).toEqual([]);
  });

  it("matches the divider label case-insensitively and inside decoration", () => {
    const result = findFoundationPages(
      pages("═══ 🎨 FOUNDATIONS ═══", "Colors", "═══ Components ═══", "Button"),
    );

    expect(result.source).toBe("foundation-divider");
    expect(result.pages.map((page) => page.name)).toEqual(["Colors"]);
  });

  it("takes the first Foundation divider and reports the rest", () => {
    const result = findFoundationPages(
      pages(
        "--- Foundation ---",
        "Colors",
        "--- Old Foundation ---",
        "Legacy colors",
      ),
    );

    expect(result.pages.map((page) => page.name)).toEqual(["Colors"]);
    expect(result.ignoredDividerLabels).toEqual(["Old Foundation"]);
  });

  it("falls back to every non-divider page when no Foundation divider exists", () => {
    const result = findFoundationPages(
      pages("Cover", "--- Components ---", "Buttons", "Avatar"),
    );

    expect(result.source).toBe("all-pages");
    expect(result.pages.map((page) => page.name)).toEqual([
      "Cover",
      "Buttons",
      "Avatar",
    ]);
    expect(result.ignoredDividerLabels).toEqual([]);
  });

  it("survives an empty file", () => {
    expect(findFoundationPages([])).toEqual({
      pages: [],
      source: "all-pages",
      ignoredDividerLabels: [],
    });
  });

  it("does not treat a hyphenated page name as a divider", () => {
    const result = findFoundationPages(
      pages("Documentation for Ari - testing", "Page 10"),
    );

    expect(result.pages).toHaveLength(2);
  });
});
