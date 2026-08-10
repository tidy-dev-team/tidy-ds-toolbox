/// <reference types="@figma/plugin-typings" />

import { UtilityResult } from "../types";
import { upsertMisprintLine } from "../../../shared/misprint";
import {
  lookupComponentAliases,
  upsertAlsoKnownAsLine,
} from "../../../shared/component-aliases";

export interface SearchabilityResult {
  /** The alternative names written, empty when the table has no entry (#176). */
  aliases: string[];
}

/**
 * Write both searchability lines onto a component (set) description: the
 * `Also known as:` line (#176) and the Hebrew-scrambled misprint marker
 * (#98). Exported so the MCP `tidy_misprint_apply` Operation writes exactly
 * what the utility writes.
 *
 * Both formats live in `shared/` next to the QA check that reads them, and
 * both writes are idempotent, so running this twice changes nothing.
 *
 * `descriptionMarkdown` is the field, not `description`. They are two views
 * of the same annotation, and only the markdown one renders formatting: the
 * plain field shows `**Dropdown**` as those literal characters in the
 * component's configuration panel. Reading and writing the same view also
 * keeps the round trip honest - the alias line is read back with its
 * asterisks, matched, and rewritten, instead of being read stripped and
 * added a second time.
 */
export function addSearchabilityToDescription(
  element: ComponentNode | ComponentSetNode,
): SearchabilityResult {
  const aliases = lookupComponentAliases(element.name);

  let description = element.descriptionMarkdown ?? "";
  description = upsertAlsoKnownAsLine(description, aliases);
  description = upsertMisprintLine(description, element.name);
  element.descriptionMarkdown = description;

  return { aliases };
}

/**
 * Main handler for the Misprint utility.
 * Writes the alias line and the scrambled keyword marker for searchability.
 */
export async function runMisprint(): Promise<UtilityResult> {
  const selection = figma.currentPage.selection;

  if (selection.length === 0) {
    return {
      success: false,
      message: "Please select at least one component or component set.",
    };
  }

  // Filter selection for components and component sets
  const validElements = selection.filter(
    (node): node is ComponentNode | ComponentSetNode =>
      node.type === "COMPONENT" || node.type === "COMPONENT_SET",
  );

  if (validElements.length === 0) {
    return {
      success: false,
      message:
        "No components or component sets selected. Please select components to add misprint to.",
    };
  }

  // Apply the searchability lines to each valid element
  const withoutAliases: string[] = [];
  for (const element of validElements) {
    try {
      const { aliases } = addSearchabilityToDescription(element);
      if (aliases.length === 0) withoutAliases.push(element.name);
    } catch (error) {
      console.error("Error adding misprint:", error);
    }
  }

  return {
    success: true,
    message: describeRun(validElements.length, withoutAliases),
    count: validElements.length,
  };
}

/**
 * The run's report.
 *
 * Components the alias table does not know are named, not counted: the gap is
 * only closable by someone adding them to the table, and a bare number does
 * not say which ones.
 */
function describeRun(total: number, withoutAliases: string[]): string {
  const done = `Added misprint to ${total} component${total === 1 ? "" : "s"}.`;
  if (withoutAliases.length === 0) return done;

  const named = withoutAliases.slice(0, 5).join(", ");
  const rest =
    withoutAliases.length > 5 ? ` and ${withoutAliases.length - 5} more` : "";

  return `${done} No alternative names on file for ${named}${rest} - add them to the alias table.`;
}
