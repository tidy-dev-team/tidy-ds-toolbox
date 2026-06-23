import {
  BuildInventoryOptions,
  ColorInventory,
  ColorRole,
  ColorUsage,
  InventoryColor,
  InventorySection,
  UsageContainer,
} from "../types";
import { hexToHsl } from "./color";

/**
 * Pure aggregation core — the test seam.
 *
 * Takes a flat list of solid-color usages (produced by the Figma tree walk in
 * utils/scan.ts) and returns the full inventory model: grouped by role,
 * deduplicated by hex + opacity, counted, where-used containers de-duplicated
 * and capped, and sorted. No Figma dependency.
 */

const DEFAULT_WHERE_USED_CAP = 10;

// Stable role order for the output sections.
const ROLE_ORDER: ColorRole[] = ["background", "text", "border", "icon"];

interface Accumulator {
  hex: string;
  opacity: number;
  count: number;
  variableName: string | null;
  styleName: string | null;
  // container id -> { container, count }
  containers: Map<string, { container: UsageContainer; count: number }>;
}

export function buildColorInventory(
  usages: ColorUsage[],
  options: BuildInventoryOptions,
): ColorInventory {
  const cap = options.whereUsedCap ?? DEFAULT_WHERE_USED_CAP;

  // role -> colorKey(hex|opacity) -> accumulator
  const byRole = new Map<ColorRole, Map<string, Accumulator>>();
  for (const role of ROLE_ORDER) {
    byRole.set(role, new Map());
  }

  for (const usage of usages) {
    const roleMap = byRole.get(usage.role);
    if (!roleMap) continue; // ignore unknown roles defensively
    const key = `${usage.hex}|${usage.opacity}`;
    let acc = roleMap.get(key);
    if (!acc) {
      acc = {
        hex: usage.hex,
        opacity: usage.opacity,
        count: 0,
        variableName: null,
        styleName: null,
        containers: new Map(),
      };
      roleMap.set(key, acc);
    }
    acc.count += 1;
    if (acc.variableName === null && usage.variableName !== null) {
      acc.variableName = usage.variableName;
    }
    if (acc.styleName === null && usage.styleName !== null) {
      acc.styleName = usage.styleName;
    }
    const existing = acc.containers.get(usage.container.id);
    if (existing) {
      existing.count += 1;
    } else {
      acc.containers.set(usage.container.id, {
        container: usage.container,
        count: 1,
      });
    }
  }

  const sections: InventorySection[] = ROLE_ORDER.map((role) => {
    const roleMap = byRole.get(role)!;
    const colors: InventoryColor[] = [...roleMap.values()].map((acc) =>
      toInventoryColor(acc, cap),
    );
    sortColors(colors, options.sortByHue ?? false);
    return { role, colors };
  });

  const byRoleCount = {
    background: sectionCount(sections, "background"),
    text: sectionCount(sections, "text"),
    border: sectionCount(sections, "border"),
    icon: sectionCount(sections, "icon"),
  };
  const uniqueTotal =
    byRoleCount.background +
    byRoleCount.text +
    byRoleCount.border +
    byRoleCount.icon;
  // Untokenized = not bound to a variable. A style-only color still counts as
  // untokenized (a style is the old way; the goal is variables).
  const untokenized = sections.reduce(
    (sum, section) =>
      sum + section.colors.filter((c) => c.variableName === null).length,
    0,
  );

  return {
    summary: {
      pagesScanned: options.pagesScanned,
      uniqueTotal,
      byRole: byRoleCount,
      untokenized,
      otherSkipped: options.otherSkipped,
    },
    sections,
  };
}

function toInventoryColor(acc: Accumulator, cap: number): InventoryColor {
  // Distinct containers, most-used first.
  const sortedContainers = [...acc.containers.values()].sort(
    (a, b) => b.count - a.count,
  );
  const whereUsed = sortedContainers.slice(0, cap).map((c) => c.container);
  const whereUsedOverflow = Math.max(0, sortedContainers.length - cap);

  return {
    hex: acc.hex,
    opacity: acc.opacity,
    hsl: hexToHsl(acc.hex),
    count: acc.count,
    variableName: acc.variableName,
    styleName: acc.styleName,
    whereUsed,
    whereUsedOverflow,
  };
}

function sortColors(colors: InventoryColor[], sortByHue: boolean): void {
  if (sortByHue) {
    colors.sort(
      (a, b) =>
        a.hsl.h - b.hsl.h ||
        a.hsl.s - b.hsl.s ||
        a.hsl.l - b.hsl.l ||
        b.count - a.count,
    );
  } else {
    // Usage count descending; hex as a stable tiebreaker.
    colors.sort((a, b) => b.count - a.count || a.hex.localeCompare(b.hex));
  }
}

function sectionCount(sections: InventorySection[], role: ColorRole): number {
  const section = sections.find((s) => s.role === role);
  return section ? section.colors.length : 0;
}
