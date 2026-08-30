/// <reference types="@figma/plugin-typings" />

import { UtilityResult } from "../types";
import { upsertMisprintLine } from "../../../shared/misprint";
import {
  lookupComponentAliases,
  upsertAlsoKnownAsLine,
} from "../../../shared/component-aliases";
import {
  createCancellationToken,
  runUntilCancelled,
  type CancellationToken,
} from "../../../shared/cancellation";

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

/**
 * One id resolved far enough to know whether it can be written to.
 *
 * The node is carried rather than re-fetched by the writing half, so each id
 * is looked up exactly once and what validation learned is what writing acts
 * on.
 */
export interface MisprintTarget {
  id: string;
  node: { type: string; name: string; descriptionMarkdown?: string };
}

/** What validating the id list produced, and whether it ran to the end. */
export interface MisprintResolution {
  resolved: MisprintTarget[];
  missing: string[];
  wrongType: string[];
  /** True when a stop request ended validation before every id was checked. */
  cancelled: boolean;
}

/** Loose enough to take a real Figma node and a test stand-in alike. */
export type MisprintLookup = (
  id: string,
) => Promise<{ type: string; name: string; id: string } | null>;

/**
 * Look every id up, one at a time, and sort it into resolved, missing and
 * wrong-type.
 *
 * This is the stoppable half of `tidy_misprint_apply` (#185). Nothing has been
 * written while it runs, so a stop here costs nothing: the run ends before the
 * first description changes, which is exactly the atomic behaviour the
 * Operation's summary promises - it fails-or-stops as a whole, before any
 * write. `runUntilCancelled` owns the check-and-yield pairing; the handler
 * throws its NOT_FOUND / WRONG_NODE_TYPE errors only when `cancelled` is
 * false, so a stopped run is reported as a stop rather than dressed up as a
 * validation failure over an id list it never finished reading.
 */
export async function resolveMisprintTargets(
  ids: readonly string[],
  lookup: MisprintLookup,
  token: CancellationToken = createCancellationToken(),
): Promise<MisprintResolution> {
  const missing: string[] = [];
  const wrongType: string[] = [];
  const resolved: MisprintTarget[] = [];

  const { cancelled } = await runUntilCancelled(
    ids,
    async (id) => {
      const node = await lookup(id);
      if (!node) {
        missing.push(id);
      } else if (node.type !== "COMPONENT" && node.type !== "COMPONENT_SET") {
        wrongType.push(id);
      } else {
        resolved.push({ id, node });
      }
      return id;
    },
    token,
  );

  return { resolved, missing, wrongType, cancelled };
}

/** What writing produced. The shape the Operation has always returned. */
export interface MisprintApplyOutcome {
  updated: number;
  ids: string[];
  /** Names the alias table has no entry for, so #176's line was not written. */
  withoutAliases: string[];
}

/**
 * Write both searchability lines on every resolved component.
 *
 * Deliberately NOT stoppable, and that is the decision #185 asks this
 * Operation to make honestly. The write loop takes no cancellation token, so
 * a stop that arrives once writing has begun is not observed and the run
 * completes - the refusal is structural rather than a checkpoint somebody can
 * forget to consult. The alternative, stopping part way, would leave some
 * descriptions written and others not, and the Operation's summary promises
 * the opposite: it fails as a whole when validation rejects any id, so a
 * caller can rely on "failed" meaning "nothing changed". A silent partial
 * write would break exactly that reliance. The writes themselves are fast -
 * two string upserts per component - so the uninterruptible region is short.
 */
export function applyMisprintDescriptions(
  resolved: readonly MisprintTarget[],
  write: (node: MisprintTarget["node"]) => { aliases: string[] } = (node) =>
    // Production only ever passes real Figma nodes here; the loose structural
    // type on MisprintTarget["node"] exists so the loop is testable without
    // the API. The cast is that boundary, in one place.
    addSearchabilityToDescription(node as ComponentNode | ComponentSetNode),
): MisprintApplyOutcome {
  const withoutAliases: string[] = [];
  for (const { node } of resolved) {
    const { aliases } = write(node);
    if (aliases.length === 0) withoutAliases.push(node.name);
  }

  return {
    updated: resolved.length,
    ids: resolved.map((t) => t.id),
    withoutAliases,
  };
}

/**
 * What a stopped run tells the designer.
 *
 * By the time the stop arrives the Bridge has already answered the caller, so
 * this sentence is the only account that reaches anybody. The two facts worth
 * saying: nothing was written, and re-running is the right move - this
 * Operation is idempotent and validates everything before it writes, so
 * running it again cannot double anything or leave a partial state behind.
 */
export function describeStoppedMisprintApply(): string {
  return (
    "Misprint run stopped while looking up components. " +
    "Nothing was written - no description changed. " +
    "Running it again is safe: it re-validates everything first and writes " +
    "each component in full."
  );
}
