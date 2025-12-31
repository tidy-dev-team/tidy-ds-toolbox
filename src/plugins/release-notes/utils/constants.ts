import type { NoteTag } from "../types";

export const PLUGIN_NAMESPACE = "tidy_release_notes";
export const COMPONENT_SETS_KEY = "componentSets";
export const LAST_COMPONENT_SET_ID_KEY = "last_component_set_id";
export const LAST_SPRINT_ID_KEY = "last_sprint_id";
export const SPRINT_KEY_PREFIX = "sprint_";

export const TAG_COLORS: Record<NoteTag, string> = {
  bug_fix: "#F24822",
  enhancement: "#0D99FF",
  new_component: "#14AE5C",
  deprecation: "#FFA629",
  deleted: "#8B0000",
};

export const TAG_LABELS: Record<NoteTag, string> = {
  bug_fix: "Bug fix",
  enhancement: "Enhancement",
  new_component: "New component",
  deprecation: "Deprecation",
  deleted: "Deleted",
};

export const TAG_RGB_COLORS: Record<
  NoteTag,
  { r: number; g: number; b: number }
> = {
  bug_fix: { r: 0xf2 / 255, g: 0x48 / 255, b: 0x22 / 255 },
  enhancement: { r: 0x0d / 255, g: 0x99 / 255, b: 0xff / 255 },
  new_component: { r: 0x14 / 255, g: 0xae / 255, b: 0x5c / 255 },
  deprecation: { r: 0xff / 255, g: 0xa6 / 255, b: 0x29 / 255 },
  deleted: { r: 0x8b / 255, g: 0x00 / 255, b: 0x00 / 255 },
};

export const TAG_OPTIONS: { value: NoteTag; label: string }[] = [
  { value: "bug_fix", label: "Bug fix" },
  { value: "enhancement", label: "Enhancement" },
  { value: "new_component", label: "New component" },
  { value: "deprecation", label: "Deprecation" },
  { value: "deleted", label: "Deleted" },
];
