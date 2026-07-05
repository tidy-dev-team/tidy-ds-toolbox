// Per-status badge constants (CONTEXT.md "Chrome"): code-generated pill +
// emoji + label, never a library-component instance, so the status badge
// carries zero linkage.

import type { DocStatus } from "./docSpec";

export interface StatusBadgeStyle {
  emoji: string;
  hex: string;
}

export const STATUS_BADGE: Record<DocStatus, StatusBadgeStyle> = {
  IDEATION: { emoji: "\u{1F4A1}", hex: "#9CA3AF" },
  "in process": { emoji: "\u{1F6E0}\u{FE0F}", hex: "#60A5FA" },
  "DESIGN COMPLETED": { emoji: "\u{2705}", hex: "#34D399" },
  REVIEWING: { emoji: "\u{1F440}", hex: "#FBBF24" },
  "DEV HAND-OFF": { emoji: "\u{1F680}", hex: "#818CF8" },
  "ON HOLD": { emoji: "\u{23F8}\u{FE0F}", hex: "#F97316" },
  CANCELED: { emoji: "\u{274C}", hex: "#F87171" },
  LIVE: { emoji: "\u{1F7E2}", hex: "#22C55E" },
};
