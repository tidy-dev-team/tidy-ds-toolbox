import { describe, it, expect } from "vitest";
import {
  CSV_HEADER,
  buildSprintCsv,
  csvFileName,
  escapeCsvField,
  figmaNodeUrl,
  parseFileKey,
  toIsoDay,
} from "./csv";
import type { ReleaseNote, Sprint, Subject } from "../types";

const COMPONENT: Subject = {
  kind: "component-set",
  id: "2733:72",
  name: "Buttons",
};
const FOUNDATION: Subject = {
  kind: "foundation-page",
  id: "410:9",
  name: "↳ 🟡 Colors",
};

function note(overrides: Partial<ReleaseNote> = {}): ReleaseNote {
  return {
    id: "1",
    description: "Fixed the focus ring",
    tag: "bug_fix",
    subject: COMPONENT,
    createdAt: "2026-07-28T09:15:00.000Z",
    authorId: "u1",
    authorName: "Dmitri",
    ...overrides,
  };
}

function sprint(notes: ReleaseNote[]): Sprint {
  return { id: "100", name: "Sprint 2", notes };
}

describe("toIsoDay", () => {
  it("keeps the day only", () => {
    expect(toIsoDay("2026-07-28T09:15:00.000Z")).toBe("2026-07-28");
  });

  it("is empty for an unparseable date rather than 'Invalid Date'", () => {
    expect(toIsoDay("not a date")).toBe("");
  });
});

describe("figmaNodeUrl", () => {
  it("uses the modern /design/ form with a dashed node id", () => {
    expect(figmaNodeUrl("abc123XYZ456", "2733:72")).toBe(
      "https://www.figma.com/design/abc123XYZ456?node-id=2733-72",
    );
  });

  it("is empty when no file key is known", () => {
    expect(figmaNodeUrl(null, "2733:72")).toBe("");
  });
});

describe("parseFileKey", () => {
  it.each([
    [
      "https://www.figma.com/design/QWErty123456/Kido-DS?node-id=1-2",
      "QWErty123456",
    ],
    ["https://www.figma.com/file/QWErty123456/Kido-DS", "QWErty123456"],
    ["QWErty123456", "QWErty123456"],
    ["  https://figma.com/design/QWErty123456/X  ", "QWErty123456"],
  ])("reads %s", (input, expected) => {
    expect(parseFileKey(input)).toBe(expected);
  });

  it.each(["", "   ", "not a url", "https://example.com/design/abc"])(
    "rejects %s",
    (input) => {
      expect(parseFileKey(input)).toBeNull();
    },
  );
});

describe("escapeCsvField", () => {
  it("leaves a plain value alone", () => {
    expect(escapeCsvField("Buttons")).toBe("Buttons");
  });

  it("quotes a value with a comma", () => {
    expect(escapeCsvField("Fixed hover, focus and active")).toBe(
      '"Fixed hover, focus and active"',
    );
  });

  it("doubles inner quotes", () => {
    expect(escapeCsvField('Renamed to "Primary"')).toBe(
      '"Renamed to ""Primary"""',
    );
  });

  it("quotes a value containing a newline", () => {
    expect(escapeCsvField("line one\nline two")).toBe('"line one\nline two"');
  });
});

describe("buildSprintCsv", () => {
  it("emits the header byte-for-byte", () => {
    const csv = buildSprintCsv(sprint([]), "KEY1234567");

    expect(csv).toBe("Date,Component/ Foundation,Changes,Tag,Figma Link");
    expect(CSV_HEADER[1]).toBe("Component/ Foundation");
  });

  it("writes one row per note, newest first", () => {
    const csv = buildSprintCsv(
      sprint([
        note({ id: "1", createdAt: "2026-07-28T09:00:00.000Z" }),
        note({
          id: "2",
          createdAt: "2026-07-30T09:00:00.000Z",
          description: "Added warning ramp",
          tag: "new_component",
          subject: FOUNDATION,
        }),
      ]),
      "KEY1234567",
    );

    expect(csv.split("\r\n")).toEqual([
      "Date,Component/ Foundation,Changes,Tag,Figma Link",
      "2026-07-30,↳ 🟡 Colors,Added warning ramp,Added,https://www.figma.com/design/KEY1234567?node-id=410-9",
      "2026-07-28,Buttons,Fixed the focus ring,Fixed,https://www.figma.com/design/KEY1234567?node-id=2733-72",
    ]);
  });

  it("prints the tag label, never the stored enum value", () => {
    const csv = buildSprintCsv(
      sprint([note({ tag: "new_component" }), note({ tag: "deprecation" })]),
      null,
    );

    expect(csv).toContain(",Added,");
    expect(csv).toContain(",Deprecated,");
    expect(csv).not.toContain("new_component");
    expect(csv).not.toContain("deprecation");
  });

  it("leaves the link cell empty when no file key is known", () => {
    const csv = buildSprintCsv(sprint([note()]), null);

    expect(csv.split("\r\n")[1]).toBe(
      "2026-07-28,Buttons,Fixed the focus ring,Fixed,",
    );
  });

  it("survives a description containing commas, quotes and newlines", () => {
    const csv = buildSprintCsv(
      sprint([
        note({ description: 'Renamed "Ghost", see\nthe migration note' }),
      ]),
      null,
    );

    expect(csv).toContain('"Renamed ""Ghost"", see\nthe migration note"');
  });
});

describe("csvFileName", () => {
  it("names the file after the sprint", () => {
    expect(csvFileName("Sprint 2")).toBe("DS changelog - Sprint 2.csv");
  });

  it("strips characters a filesystem rejects", () => {
    expect(csvFileName("Q3/Q4: push")).toBe("DS changelog - Q3-Q4- push.csv");
  });

  it("falls back when the sprint name is blank", () => {
    expect(csvFileName("   ")).toBe("DS changelog - sprint.csv");
  });
});
