/**
 * Pure mapping from a checklist item's `ItemStatus` to its on-canvas
 * presentation (short label + chip colour). Kept pure and separate from the
 * Figma renderer so the palette is unit-testable and the visual design can be
 * retuned in one place (PRD §7 — the renderer is a swappable module).
 */

import type { ItemStatus } from "../types";

export interface StatusStyle {
  /** Short label shown inside the status chip. */
  label: string;
  /** Chip colour as a hex string. */
  hex: string;
}

// One entry per ItemStatus — typed as a full Record so a new status added to
// the union fails to compile until its style is declared here.
const STATUS_STYLE: Record<ItemStatus, StatusStyle> = {
  pass: { label: "Pass", hex: "#16A34A" },
  warn: { label: "Warning", hex: "#D97706" },
  fail: { label: "Fail", hex: "#DC2626" },
  not_applicable: { label: "N/A", hex: "#6B7280" },
  manual: { label: "Manual", hex: "#202257" },
  not_implemented: { label: "Pending", hex: "#9CA3AF" },
  not_run: { label: "Skipped", hex: "#9CA3AF" },
};

export function statusStyle(status: ItemStatus): StatusStyle {
  return STATUS_STYLE[status];
}
