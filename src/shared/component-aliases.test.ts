import { describe, expect, it } from "vitest";

import {
  ALSO_KNOWN_AS_PREFIX,
  COMPONENT_ALIASES,
  createAlsoKnownAsText,
  lookupComponentAliases,
  parseAlsoKnownAsLine,
  upsertAlsoKnownAsLine,
} from "./component-aliases";
import { createMisprintText, upsertMisprintLine } from "./misprint";

describe("lookupComponentAliases", () => {
  it("answers for an exact component name", () => {
    expect(lookupComponentAliases("Stepper")).toContain("Progress Tracker");
  });

  it("answers for a whole family through the head of the name", () => {
    expect(lookupComponentAliases("Slider / With Values and Marks")).toEqual(
      lookupComponentAliases("Slider"),
    );
    expect(lookupComponentAliases("Card / With Image")).toEqual(
      lookupComponentAliases("Card"),
    );
    expect(lookupComponentAliases("Text Input Underlined")).toEqual(
      lookupComponentAliases("Text Input"),
    );
  });

  it("prefers the longest head, so a shared word cannot hijack the name", () => {
    // "Numeric Input / Stepper 1" is a number spinner, not the progress
    // Stepper - and the tail is never matched on its own.
    expect(lookupComponentAliases("Numeric Input / Stepper 1")).toEqual(
      lookupComponentAliases("Numeric Input"),
    );
    expect(lookupComponentAliases("Numeric Input / Stepper 1")).not.toContain(
      "Progress Tracker",
    );
  });

  it("reads through the punctuation and status emoji a name carries", () => {
    expect(lookupComponentAliases("Breadcrumbs 🟡")).toEqual(
      lookupComponentAliases("Breadcrumbs"),
    );
    expect(lookupComponentAliases("Tabs / Anatomy / Outlined tabs 🔴")).toEqual(
      lookupComponentAliases("Tabs"),
    );
  });

  it("falls back to the tail when the name leads with a qualifier", () => {
    expect(lookupComponentAliases("notification-banner")).toEqual(
      lookupComponentAliases("Banner"),
    );
    expect(lookupComponentAliases("DangerAlert")).toEqual(
      lookupComponentAliases("Alert"),
    );
  });

  it("answers for a name a head-first match cannot reach, listed in its own right", () => {
    expect(lookupComponentAliases("Asset Badge")).toContain("Tag");
    expect(lookupComponentAliases("CheckboxVector")).toContain("Tick Box");
  });

  it("splits the PascalCase names real sets carry", () => {
    // Names taken from the file the issue was raised against.
    expect(lookupComponentAliases("BadgeNotification")).toEqual(
      lookupComponentAliases("Badge"),
    );
    expect(lookupComponentAliases("🔵BannerDesktop")).toEqual(
      lookupComponentAliases("Banner"),
    );
    expect(lookupComponentAliases("MessageAlertStatusMobile")).toEqual(
      lookupComponentAliases("Message"),
    );
    expect(lookupComponentAliases("BtnGroupHorizontal")).toEqual(
      lookupComponentAliases("Button"),
    );
  });

  it("splits before a capitalised word rather than inside an acronym", () => {
    expect(lookupComponentAliases("CTAButton")).toEqual(
      lookupComponentAliases("Button"),
    );
  });

  it("reads a kebab-case name", () => {
    expect(lookupComponentAliases("text-input-outlined")).toEqual(
      lookupComponentAliases("Text Input"),
    );
  });

  it("reports nothing for a component the table does not know", () => {
    expect(lookupComponentAliases("Sparkline")).toEqual([]);
    expect(lookupComponentAliases("")).toEqual([]);
  });
});

describe("the alias table", () => {
  it("gives every entry at least two alternative names", () => {
    for (const entry of COMPONENT_ALIASES) {
      expect(entry.aliases.length).toBeGreaterThanOrEqual(2);
      expect(entry.names.length).toBeGreaterThanOrEqual(1);
    }
  });

  it("claims each name once, so a lookup has one answer", () => {
    const claimed = new Map<string, string[]>();
    for (const entry of COMPONENT_ALIASES) {
      for (const name of entry.names) {
        const key = name.toLowerCase();
        claimed.set(key, [...(claimed.get(key) ?? []), entry.names[0]]);
      }
    }

    const duplicated = [...claimed].filter(([, owners]) => owners.length > 1);
    expect(duplicated).toEqual([]);
  });

  it("never repeats the component's own name as an alternative", () => {
    for (const entry of COMPONENT_ALIASES) {
      const own = new Set(entry.names.map((name) => name.toLowerCase()));
      for (const alias of entry.aliases) {
        expect(own.has(alias.toLowerCase())).toBe(false);
      }
    }
  });
});

describe("parseAlsoKnownAsLine", () => {
  it("reads the names off a line", () => {
    expect(parseAlsoKnownAsLine("Also known as: Dialog, Popup")).toEqual([
      "Dialog",
      "Popup",
    ]);
  });

  it("tolerates the label's casing and spacing", () => {
    expect(parseAlsoKnownAsLine("  ALSO  KNOWN  AS :Dialog")).toEqual([
      "Dialog",
    ]);
  });

  it("strips the markdown bold a hand-written line arrives with", () => {
    expect(
      parseAlsoKnownAsLine("Also known as: **Pagination, Progress Tracker**"),
    ).toEqual(["Pagination", "Progress Tracker"]);
  });

  it("reads a hand-written line that has no colon", () => {
    expect(parseAlsoKnownAsLine("Also known as **Dropdown**")).toEqual([
      "Dropdown",
    ]);
  });

  it("reports null for any other line", () => {
    expect(parseAlsoKnownAsLine("misprint: ןמפוא")).toBeNull();
    expect(parseAlsoKnownAsLine("")).toBeNull();
  });
});

describe("upsertAlsoKnownAsLine", () => {
  it("writes the line into an empty description with no stray blank line", () => {
    expect(upsertAlsoKnownAsLine("", ["Dialog", "Popup"])).toBe(
      "Also known as: **Dialog, Popup**",
    );
  });

  it("puts the line above existing prose", () => {
    expect(upsertAlsoKnownAsLine("Use for blocking tasks.", ["Dialog"])).toBe(
      "Also known as: **Dialog**\nUse for blocking tasks.",
    );
  });

  it("changes nothing when there are no alternative names to write", () => {
    expect(upsertAlsoKnownAsLine("Use for blocking tasks.", [])).toBe(
      "Use for blocking tasks.",
    );
  });

  it("is idempotent", () => {
    const once = upsertAlsoKnownAsLine("prose", ["Dialog", "Popup"]);
    expect(upsertAlsoKnownAsLine(once, ["Dialog", "Popup"])).toBe(once);
  });

  it("keeps a name the designer added, and adds what the table knows", () => {
    expect(
      upsertAlsoKnownAsLine("Also known as: Sheet", ["Dialog", "Sheet"]),
    ).toBe("Also known as: **Sheet, Dialog**");
  });

  it("matches a name the designer bolded rather than duplicating it", () => {
    expect(upsertAlsoKnownAsLine("Also known as: **dialog**", ["Dialog"])).toBe(
      "Also known as: **dialog**",
    );
  });

  it("merges into a hand-written line that has no colon", () => {
    expect(upsertAlsoKnownAsLine("Also known as **Dropdown**", ["Menu"])).toBe(
      "Also known as: **Dropdown, Menu**",
    );
  });

  it("collapses two alias lines into the first", () => {
    // The exact state an earlier version of this writer left behind: it did
    // not recognise the colon-less line, so it added its own below it.
    const doubled = [
      "Also known as: **Drop Down, Menu**",
      "Also known as Dropdown",
      createMisprintText("Dropdown"),
    ].join("\n");

    expect(upsertAlsoKnownAsLine(doubled, ["Menu", "Combo Box"])).toBe(
      [
        "Also known as: **Drop Down, Menu, Dropdown, Combo Box**",
        createMisprintText("Dropdown"),
      ].join("\n"),
    );
  });

  it("leaves the misprint marker where it is", () => {
    const withMarker = createMisprintText("Modal");
    const updated = upsertAlsoKnownAsLine(withMarker, ["Dialog"]);

    expect(updated.split("\n")).toEqual([
      "Also known as: **Dialog**",
      withMarker,
    ]);
  });
});

describe("both searchability lines together", () => {
  it("writes the alias line first and the marker last", () => {
    let description = "";
    description = upsertAlsoKnownAsLine(description, ["Progress Tracker"]);
    description = upsertMisprintLine(description, "Stepper");

    expect(description).toBe(
      `Also known as: **Progress Tracker**\n${createMisprintText("Stepper")}`,
    );
  });

  it("is idempotent over a second run", () => {
    const write = (description: string) =>
      upsertMisprintLine(
        upsertAlsoKnownAsLine(description, lookupComponentAliases("Modal")),
        "Modal",
      );

    const once = write("Use for blocking tasks.");
    expect(write(once)).toBe(once);
  });

  it("keeps prose between the two lines", () => {
    const written = upsertMisprintLine(
      upsertAlsoKnownAsLine("Use for blocking tasks.", ["Dialog"]),
      "Modal",
    );

    expect(written.split("\n")).toEqual([
      "Also known as: **Dialog**",
      "Use for blocking tasks.",
      createMisprintText("Modal"),
    ]);
  });
});

describe("createAlsoKnownAsText", () => {
  it("uses the prefix the QA check looks for", () => {
    expect(
      createAlsoKnownAsText(["Dialog", "Popup"]).startsWith(
        ALSO_KNOWN_AS_PREFIX,
      ),
    ).toBe(true);
  });

  it("bolds the names and leaves the label plain", () => {
    expect(createAlsoKnownAsText(["Dialog", "Popup"])).toBe(
      "Also known as: **Dialog, Popup**",
    );
  });
});
