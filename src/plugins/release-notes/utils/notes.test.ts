import { describe, it, expect } from "vitest";
import {
  distinctSubjects,
  groupByTag,
  groupByTagAuthorDay,
  migrateNote,
  migrateSprint,
  sortSprintsNewestFirst,
  sprintsForSubject,
} from "./notes";
import type { ReleaseNote, Sprint } from "../types";

function note(overrides: Partial<ReleaseNote> = {}): ReleaseNote {
  return {
    id: "1",
    description: "d",
    tag: "bug_fix",
    subject: { kind: "component-set", id: "1:1", name: "Buttons" },
    createdAt: "2026-07-28T09:00:00.000Z",
    authorId: "u1",
    authorName: "Dmitri",
    ...overrides,
  };
}

describe("migrateNote", () => {
  it("reads a pre-Subject note as a component-set Subject", () => {
    const migrated = migrateNote({
      id: "9",
      description: "Fixed the ring",
      tag: "bug_fix",
      componentSetId: "2733:72",
      componentSetName: "Buttons",
      createdAt: "2026-01-02T00:00:00.000Z",
      authorId: "u1",
      authorName: "Dmitri",
    });

    expect(migrated?.subject).toEqual({
      kind: "component-set",
      id: "2733:72",
      name: "Buttons",
    });
  });

  it("keeps a Subject that is already there", () => {
    const migrated = migrateNote({
      id: "9",
      tag: "new_component",
      subject: { kind: "foundation-page", id: "4:1", name: "Colors" },
      createdAt: "2026-01-02T00:00:00.000Z",
    });

    expect(migrated?.subject.kind).toBe("foundation-page");
    expect(migrated?.subject.id).toBe("4:1");
  });

  it("defaults an unknown subject kind to component-set rather than inventing one", () => {
    const migrated = migrateNote({
      id: "9",
      subject: { kind: "wat", id: "4:1", name: "X" },
      createdAt: "2026-01-02T00:00:00.000Z",
    });

    expect(migrated?.subject.kind).toBe("component-set");
  });

  it("drops a note with no id or no subject, rather than showing a broken row", () => {
    expect(migrateNote({ id: "9" })).toBeNull();
    expect(migrateNote({ componentSetId: "1:1" })).toBeNull();
    expect(migrateNote(null)).toBeNull();
    expect(migrateNote("nope")).toBeNull();
  });

  it("falls back on a tag it does not recognise", () => {
    const migrated = migrateNote({
      id: "9",
      tag: "exploded",
      componentSetId: "1:1",
      componentSetName: "Buttons",
    });

    expect(migrated?.tag).toBe("enhancement");
  });
});

describe("migrateSprint", () => {
  it("keeps readable notes and drops the rest", () => {
    const migrated = migrateSprint({
      id: "100",
      name: "Sprint 2",
      notes: [
        { id: "1", componentSetId: "1:1", componentSetName: "Buttons" },
        { description: "no id, no subject" },
      ],
    });

    expect(migrated?.notes).toHaveLength(1);
  });

  it("returns null when the sprint itself is unreadable", () => {
    expect(migrateSprint({ name: "no id" })).toBeNull();
    expect(migrateSprint(undefined)).toBeNull();
  });

  it("treats a missing notes array as an empty sprint", () => {
    expect(migrateSprint({ id: "1", name: "S" })?.notes).toEqual([]);
  });
});

describe("groupByTag", () => {
  it("orders buckets Added, Changed, Fixed, Deprecated, Deleted", () => {
    const groups = groupByTag([
      note({ tag: "deleted" }),
      note({ tag: "new_component" }),
      note({ tag: "bug_fix" }),
      note({ tag: "enhancement" }),
    ]);

    expect(groups.map((group) => group.tag)).toEqual([
      "new_component",
      "enhancement",
      "bug_fix",
      "deleted",
    ]);
  });

  it("omits tags with no notes", () => {
    expect(groupByTag([note({ tag: "bug_fix" })])).toHaveLength(1);
  });
});

describe("groupByTagAuthorDay", () => {
  it("collapses same tag, same author, same day into one bucket", () => {
    const groups = groupByTagAuthorDay([
      note({ id: "1", createdAt: "2026-07-28T09:00:00.000Z" }),
      note({ id: "2", createdAt: "2026-07-28T17:30:00.000Z" }),
    ]);

    expect(groups).toHaveLength(1);
    expect(groups[0]).toHaveLength(2);
  });

  it("splits on a different author", () => {
    const groups = groupByTagAuthorDay([
      note({ id: "1", authorId: "u1" }),
      note({ id: "2", authorId: "u2" }),
    ]);

    expect(groups).toHaveLength(2);
  });

  it("splits on a different day and a different tag", () => {
    expect(
      groupByTagAuthorDay([
        note({ id: "1", createdAt: "2026-07-28T09:00:00.000Z" }),
        note({ id: "2", createdAt: "2026-07-29T09:00:00.000Z" }),
      ]),
    ).toHaveLength(2);

    expect(
      groupByTagAuthorDay([
        note({ id: "1", tag: "bug_fix" }),
        note({ id: "2", tag: "deleted" }),
      ]),
    ).toHaveLength(2);
  });
});

describe("distinctSubjects", () => {
  it("keeps one entry per subject id", () => {
    const subjects = distinctSubjects([
      note({ subject: { kind: "component-set", id: "1:1", name: "Buttons" } }),
      note({ subject: { kind: "component-set", id: "1:1", name: "Buttons" } }),
      note({ subject: { kind: "foundation-page", id: "4:1", name: "Colors" } }),
    ]);

    expect(subjects.map((subject) => subject.id)).toEqual(["1:1", "4:1"]);
  });
});

describe("sprintsForSubject", () => {
  const sprints: Sprint[] = [
    {
      id: "100",
      name: "Sprint 1",
      notes: [
        note({ id: "a" }),
        note({
          id: "b",
          subject: { kind: "foundation-page", id: "4:1", name: "Colors" },
        }),
      ],
    },
    { id: "200", name: "Sprint 2", notes: [note({ id: "c" })] },
    { id: "300", name: "Sprint 3", notes: [] },
  ];

  it("returns newest sprint first and skips sprints with nothing to say", () => {
    const result = sprintsForSubject(sprints, "1:1");

    expect(result.map((entry) => entry.sprint.name)).toEqual([
      "Sprint 2",
      "Sprint 1",
    ]);
  });

  it("filters notes down to the subject asked for", () => {
    const result = sprintsForSubject(sprints, "4:1");

    expect(result).toHaveLength(1);
    expect(result[0].notes.map((n) => n.id)).toEqual(["b"]);
  });
});

describe("sortSprintsNewestFirst", () => {
  it("orders by the timestamp id, descending", () => {
    const sorted = sortSprintsNewestFirst([
      { id: "100", name: "a", notes: [] },
      { id: "300", name: "c", notes: [] },
      { id: "200", name: "b", notes: [] },
    ]);

    expect(sorted.map((sprint) => sprint.name)).toEqual(["c", "b", "a"]);
  });
});
