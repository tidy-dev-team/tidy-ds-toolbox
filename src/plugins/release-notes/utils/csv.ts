/**
 * CSV export: one sprint, one row per note.
 *
 * The header is emitted byte-for-byte as the sheet this was modelled on has
 * it, odd spacing in "Component/ Foundation" included, so anything already
 * keyed on that header keeps working.
 */

import type { ReleaseNote, Sprint } from "../types";
import { TAG_LABELS } from "./constants";
import { toIsoDay } from "./dates";

export const CSV_HEADER = [
  "Date",
  "Component/ Foundation",
  "Changes",
  "Tag",
  "Figma Link",
] as const;

/**
 * A deep link to a node. Figma's modern URL form spells node ids with a dash
 * rather than a colon; the file-name slug is optional and omitted.
 */
export function figmaNodeUrl(fileKey: string | null, nodeId: string): string {
  if (!fileKey || !nodeId) return "";
  return `https://www.figma.com/design/${fileKey}?node-id=${nodeId.replace(/:/g, "-")}`;
}

/**
 * Pull the file key out of anything a designer might paste: a /design/ or
 * /file/ URL, or the bare key itself.
 */
export function parseFileKey(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  const fromUrl = trimmed.match(
    /figma\.com\/(?:design|file|board|proto)\/([A-Za-z0-9]{10,})/,
  );
  if (fromUrl) return fromUrl[1];

  if (/^[A-Za-z0-9]{10,}$/.test(trimmed)) return trimmed;

  return null;
}

/** RFC 4180: quote when the value carries a comma, quote or newline. */
export function escapeCsvField(value: string): string {
  if (!/[",\r\n]/.test(value)) return value;
  return `"${value.replace(/"/g, '""')}"`;
}

export function toCsvRow(fields: readonly string[]): string {
  return fields.map(escapeCsvField).join(",");
}

function noteRow(note: ReleaseNote, fileKey: string | null): string[] {
  return [
    toIsoDay(note.createdAt),
    note.subject.name,
    note.description,
    TAG_LABELS[note.tag],
    figmaNodeUrl(fileKey, note.subject.id),
  ];
}

/**
 * The sprint's notes as CSV, newest first - the order the panel and the canvas
 * card already use.
 */
export function buildSprintCsv(sprint: Sprint, fileKey: string | null): string {
  const rows = [...sprint.notes]
    .sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    )
    .map((note) => toCsvRow(noteRow(note, fileKey)));

  return [toCsvRow(CSV_HEADER), ...rows].join("\r\n");
}

/** `DS changelog - Sprint 2.csv`, with characters a filesystem rejects removed. */
export function csvFileName(sprintName: string): string {
  const safe = sprintName.replace(/[\\/:*?"<>|]/g, "-").trim();
  return `DS changelog - ${safe || "sprint"}.csv`;
}
