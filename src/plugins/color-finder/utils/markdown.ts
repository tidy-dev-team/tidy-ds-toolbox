import {
  ColorInventory,
  InventoryColor,
  InventorySection,
  ColorRole,
} from "../types";

/**
 * Pure markdown serializer (issue #2). Turns a ColorInventory into a markdown
 * document the designer can paste into a doc or ticket. No Figma dependency —
 * unit-tested directly.
 */

const ROLE_LABELS: Record<ColorRole, string> = {
  background: "Backgrounds",
  text: "Text",
  border: "Borders",
  icon: "Icons",
};

export function serializeInventoryToMarkdown(
  inventory: ColorInventory,
): string {
  const { summary } = inventory;
  const lines: string[] = [];

  lines.push(`# Color Inventory`);
  lines.push("");
  lines.push(
    `${summary.uniqueTotal} unique color${summary.uniqueTotal === 1 ? "" : "s"} — ` +
      `${summary.byRole.background} background, ${summary.byRole.text} text, ` +
      `${summary.byRole.border} border, ${summary.byRole.icon} icon; ` +
      `${summary.untokenized} untokenized ` +
      `(${summary.pagesScanned} page${summary.pagesScanned === 1 ? "" : "s"} scanned).`,
  );

  for (const section of inventory.sections) {
    lines.push("");
    lines.push(serializeSection(section));
  }

  return lines.join("\n");
}

function serializeSection(section: InventorySection): string {
  const lines: string[] = [];
  lines.push(`## ${ROLE_LABELS[section.role]} (${section.colors.length})`);
  lines.push("");
  lines.push(`| Hex | HSL | Variable | Style | Count | Where used |`);
  lines.push(`| --- | --- | --- | --- | --- | --- |`);
  if (section.colors.length === 0) {
    lines.push(`| _none_ |  |  |  |  |  |`);
  } else {
    for (const color of section.colors) {
      lines.push(serializeRow(color));
    }
  }
  return lines.join("\n");
}

function serializeRow(color: InventoryColor): string {
  const hex =
    color.opacity < 1
      ? `${color.hex} · ${Math.round(color.opacity * 100)}%`
      : color.hex;
  const hsl = `H ${color.hsl.h} S ${color.hsl.s} L ${color.hsl.l}`;
  const variable = color.variableName ?? "Raw";
  const style = color.styleName ?? "—";
  const where = serializeWhereUsed(color);
  return `| ${hex} | ${hsl} | ${variable} | ${style} | ${color.count} | ${where} |`;
}

function serializeWhereUsed(color: InventoryColor): string {
  if (color.whereUsed.length === 0) return "—";
  const names = color.whereUsed.map((c) => c.name).join(", ");
  return color.whereUsedOverflow > 0
    ? `${names} and ${color.whereUsedOverflow} more`
    : names;
}
