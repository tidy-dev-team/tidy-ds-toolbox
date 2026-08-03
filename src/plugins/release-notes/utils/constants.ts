import type { NoteTag } from "../types";

export const PLUGIN_NAMESPACE = "tidy_release_notes";
export const COMPONENT_SETS_KEY = "componentSets";
export const LAST_COMPONENT_SET_ID_KEY = "last_component_set_id";
export const LAST_FOUNDATION_PAGE_ID_KEY = "last_foundation_page_id";
export const LAST_SPRINT_ID_KEY = "last_sprint_id";
export const SPRINT_KEY_PREFIX = "sprint_";
/** File key pasted by the designer when Figma withholds `figma.fileKey`. */
export const FILE_KEY_KEY = "file_key";

/**
 * Identity of a published card. A card is found again by this stamp, never by
 * frame name or position, so renaming a Subject cannot orphan its card.
 */
export const CARD_STAMP_KEY = "tidy:release-note";

/** Frame-name suffix used by versions before the stamp existed. */
export const LEGACY_CARD_NAME_SUFFIX = "-release-notes";
/** Container the pre-stamp aggregate was written into. */
export const LEGACY_AGGREGATE_FRAME_NAME = "release-notes-frame";

export const RELEASE_NOTES_PAGE_NAME = "Release notes";

// ===================
// Tag vocabulary
// ===================
//
// The enum values are legacy identifiers kept so notes already saved in files
// still load. They are never shown: panel, canvas and CSV all use TAG_LABELS.

export const TAG_LABELS: Record<NoteTag, string> = {
  new_component: "Added",
  enhancement: "Changed",
  bug_fix: "Fixed",
  deprecation: "Deprecated",
  deleted: "Deleted",
};

export const TAG_EMOJI: Record<NoteTag, string> = {
  new_component: "✅",
  enhancement: "\u{1F504}",
  bug_fix: "\u{1F528}",
  deprecation: "\u{1F4E6}",
  deleted: "\u{1F5D1}️",
};

/** Order tags read in, on the card and in the panel. */
export const TAG_ORDER: NoteTag[] = [
  "new_component",
  "enhancement",
  "bug_fix",
  "deprecation",
  "deleted",
];

/** Panel chip colours (light UI). */
export const TAG_COLORS: Record<NoteTag, string> = {
  new_component: "#14AE5C",
  enhancement: "#0D99FF",
  bug_fix: "#F24822",
  deprecation: "#FFA629",
  deleted: "#8B0000",
};

export const TAG_OPTIONS: { value: NoteTag; label: string }[] = TAG_ORDER.map(
  (value) => ({ value, label: TAG_LABELS[value] }),
);

// ===================
// Canvas card design
// ===================

export const CARD_PALETTE = {
  bgSurface: { r: 0 / 255, g: 10 / 255, b: 25 / 255 },
  textBold: { r: 238 / 255, g: 243 / 255, b: 252 / 255 },
  textMuted: { r: 135 / 255, g: 152 / 255, b: 178 / 255 },
  timelineLine: { r: 135 / 255, g: 152 / 255, b: 178 / 255 },
} as const;

/** Badge background per tag, at the reference's 20% opacity. */
export const TAG_BADGE_BG: Record<
  NoteTag,
  { r: number; g: number; b: number; a: number }
> = {
  new_component: { r: 77 / 255, g: 255 / 255, b: 166 / 255, a: 0.2 },
  enhancement: { r: 77 / 255, g: 200 / 255, b: 255 / 255, a: 0.2 },
  bug_fix: { r: 255 / 255, g: 166 / 255, b: 77 / 255, a: 0.2 },
  deprecation: { r: 242 / 255, g: 204 / 255, b: 13 / 255, a: 0.2 },
  deleted: { r: 255 / 255, g: 100 / 255, b: 100 / 255, a: 0.2 },
};

export const SUBJECT_CARD_WIDTH = 560;
export const AGGREGATE_CARD_WIDTH = 700;
/** Gap between a card and the content it sits beside. */
export const CARD_GAP = 100;

export const CARD_FONT_FAMILY = "Satoshi";
export const CARD_FONT_FALLBACK_FAMILY = "Inter";
