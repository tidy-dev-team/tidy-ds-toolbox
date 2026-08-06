/**
 * How a variant is named to a human: `size=s, type=outlined, state=loading`.
 *
 * Shared, and that matters more here than duplication usually does. Two consumers
 * name the same variant in the same artifact - `variant-property-bindings` lists
 * the offending variants inside a finding's message, and the canvas sample
 * captions the picture drawn beneath that message. Two copies of this function is
 * exactly how the caption and the finding above it would come to disagree about
 * which variant is which, in a feature whose whole purpose is that they agree.
 */

import type { VariantSnapshot } from "./snapshot";

export function variantLabel(variant: VariantSnapshot): string {
  const pairs = Object.entries(variant.variantProperties);
  // A standalone component carries no variant properties (#13), so its node name
  // is the only thing there is to call it.
  if (pairs.length === 0) return variant.name;
  return pairs.map(([property, value]) => `${property}=${value}`).join(", ");
}
