/**
 * Reading, migrating and grouping notes. Pure: no Figma API.
 *
 * Notes are stored as JSON in shared plugin data, so a file can hold notes
 * written by an older build. Before Subject existed a note carried
 * `componentSetId` / `componentSetName`; those are read as a component-set
 * Subject, which is the only thing they could ever have been.
 */

import type { NoteTag, ReleaseNote, Sprint, Subject } from "../types";
import { TAG_ORDER } from "./constants";
import { toIsoDay } from "./dates";

const KNOWN_TAGS = new Set<string>(TAG_ORDER);

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : null;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function readSubject(raw: Record<string, unknown>): Subject | null {
  const subject = asRecord(raw.subject);
  if (subject) {
    const id = asString(subject.id);
    if (!id) return null;
    const kind =
      subject.kind === "foundation-page" ? "foundation-page" : "component-set";
    return { kind, id, name: asString(subject.name) ?? "Unknown" };
  }

  // Pre-Subject shape.
  const legacyId = asString(raw.componentSetId);
  if (!legacyId) return null;
  return {
    kind: "component-set",
    id: legacyId,
    name: asString(raw.componentSetName) ?? "Unknown",
  };
}

/** A stored note, or null if it is too damaged to show. */
export function migrateNote(value: unknown): ReleaseNote | null {
  const raw = asRecord(value);
  if (!raw) return null;

  const id = asString(raw.id);
  const subject = readSubject(raw);
  if (!id || !subject) return null;

  const tag = asString(raw.tag);

  return {
    id,
    description: typeof raw.description === "string" ? raw.description : "",
    tag: tag && KNOWN_TAGS.has(tag) ? (tag as NoteTag) : "enhancement",
    subject,
    createdAt: asString(raw.createdAt) ?? new Date(0).toISOString(),
    authorId: asString(raw.authorId) ?? "unknown",
    authorName: asString(raw.authorName) ?? "Unknown User",
  };
}

/** A stored sprint, with unreadable notes dropped rather than crashing the load. */
export function migrateSprint(value: unknown): Sprint | null {
  const raw = asRecord(value);
  if (!raw) return null;

  const id = asString(raw.id);
  const name = asString(raw.name);
  if (!id || !name) return null;

  const notes = Array.isArray(raw.notes)
    ? raw.notes
        .map(migrateNote)
        .filter((note): note is ReleaseNote => note !== null)
    : [];

  return { id, name, notes };
}

export function sortNotesNewestFirst(notes: ReleaseNote[]): ReleaseNote[] {
  return [...notes].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
}

/** Sprints newest first. Ids are creation timestamps. */
export function sortSprintsNewestFirst(sprints: Sprint[]): Sprint[] {
  return [...sprints].sort((a, b) => Number(b.id) - Number(a.id));
}

export interface TagGroup {
  tag: NoteTag;
  notes: ReleaseNote[];
}

/** Notes bucketed by tag, in the changelog's reading order. */
export function groupByTag(notes: ReleaseNote[]): TagGroup[] {
  const buckets = new Map<NoteTag, ReleaseNote[]>();
  for (const note of notes) {
    const bucket = buckets.get(note.tag);
    if (bucket) bucket.push(note);
    else buckets.set(note.tag, [note]);
  }

  return TAG_ORDER.filter((tag) => buckets.has(tag)).map((tag) => ({
    tag,
    notes: buckets.get(tag) as ReleaseNote[],
  }));
}

/**
 * Notes bucketed into one entry per tag + author + day, so the card can print
 * "Fixed - by Dmitri on Jul 28" once above a bullet list rather than repeating
 * the same line for every bullet.
 */
export function groupByTagAuthorDay(notes: ReleaseNote[]): ReleaseNote[][] {
  const buckets = new Map<string, ReleaseNote[]>();

  for (const note of sortNotesNewestFirst(notes)) {
    const key = `${note.tag}|${note.authorId}|${toIsoDay(note.createdAt)}`;
    const bucket = buckets.get(key);
    if (bucket) bucket.push(note);
    else buckets.set(key, [note]);
  }

  return Array.from(buckets.values());
}

/** Every distinct Subject the notes are about, in first-seen order. */
export function distinctSubjects(notes: ReleaseNote[]): Subject[] {
  const seen = new Map<string, Subject>();
  for (const note of notes) {
    if (!seen.has(note.subject.id)) seen.set(note.subject.id, note.subject);
  }
  return Array.from(seen.values());
}

/** Every note about one Subject, across all sprints, newest sprint first. */
export function sprintsForSubject(
  sprints: Sprint[],
  subjectId: string,
): Array<{ sprint: Sprint; notes: ReleaseNote[] }> {
  return sortSprintsNewestFirst(sprints)
    .map((sprint) => ({
      sprint,
      notes: sprint.notes.filter((note) => note.subject.id === subjectId),
    }))
    .filter((entry) => entry.notes.length > 0);
}
