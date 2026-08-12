/**
 * Reading a variant's property combination, and who is allowed to trust it.
 *
 * Figma throws on `variantProperties` once it has decided a set has a
 * conflicting variant combination. The read is the only place that fact
 * surfaces: nothing on the set says "I am flagged", so the exception is the
 * signal.
 *
 * The refusal is recorded per variant rather than per set, because "Figma
 * refused" and "Figma refused everywhere" are different facts and only the
 * second one justifies giving up on the arithmetic. A set-level flag raised by
 * any single throw cannot tell them apart, and a check reading it would decline
 * to look for the duplicates it can still see.
 *
 * The consequence is that a variant can carry `{}` for two unrelated reasons -
 * a standalone component genuinely has no properties, and a refused read has
 * none it could show. `{}` is therefore not a marker anything may key on, which
 * is why `propertiesUnreadable` exists beside it and why the readable/unreadable
 * split lives here rather than being re-derived by each consumer.
 */

import type { ComponentSetSnapshot, VariantSnapshot } from "./snapshot";

/**
 * The part of a Figma `ComponentNode` this module reads, declared structurally
 * so a fake with a throwing getter satisfies it.
 *
 * `variantProperties` is typed as throwing-or-null here for the same reason
 * `fonts.ts` types its own input: the whole point of the seam is a test that
 * can make the read fail without a Figma document.
 */
export interface VariantPropertiesSource {
  readonly variantProperties: Record<string, string> | null;
}

/** What one read produced: a combination, or Figma's reason for refusing. */
export type VariantPropertiesRead =
  | { readonly properties: Record<string, string> }
  | { readonly unreadable: string };

/**
 * Read one variant's property combination, turning Figma's throw into a value.
 *
 * Never rethrows. A single flagged set would otherwise abort the whole
 * snapshot, and the set that cannot be collected is precisely the set carrying
 * the defect row 13 exists to report.
 */
export function readVariantProperties(
  source: VariantPropertiesSource,
): VariantPropertiesRead {
  try {
    return { properties: source.variantProperties ?? {} };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    // Never blank: this string is printed in a finding, and "Figma refused
    // ()" tells a designer nothing about what to open.
    return { unreadable: message || "Figma gave no reason." };
  }
}

/** Variants whose property combination this snapshot actually knows. */
export function readableVariants(
  snapshot: ComponentSetSnapshot,
): VariantSnapshot[] {
  return snapshot.variants.filter((v) => v.propertiesUnreadable === undefined);
}

/** Variants Figma refused to report a property combination for. */
export function unreadableVariants(
  snapshot: ComponentSetSnapshot,
): VariantSnapshot[] {
  return snapshot.variants.filter((v) => v.propertiesUnreadable !== undefined);
}

/**
 * Figma's reason for the first refusal on this snapshot, or undefined when
 * nothing was refused.
 *
 * One reason rather than one per variant: Figma flags the *set*, so every
 * refusal on it carries the same text, and printing it once per variant would
 * pad a finding without adding a fact.
 */
export function refusalReason(
  snapshot: ComponentSetSnapshot,
): string | undefined {
  return unreadableVariants(snapshot)[0]?.propertiesUnreadable;
}
