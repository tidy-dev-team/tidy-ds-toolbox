// Reference resolution (ADR-0008): the Doc Spec carries symbolic references
// to derived facts (here, family-axis values) rather than the facts
// themselves. Structural Zod validation (docSpec.ts) runs first and fails
// fast; this runs second and collects *every* unresolved reference into one
// batched payload rather than failing on the first (ADR-0003).
//
// v1 only resolves `variants` keys — the only reference kind this slice
// renders. Sibling/mode reference kinds land with the Sections that use them.

import type { DocSpec } from "./docSpec";
import type { DerivedFacts } from "./facts";
import { didYouMean } from "./didYouMean";

export interface UnresolvedRef {
  slot: string;
  kind: string;
  value: string;
  didYouMean?: string;
}

export interface ResolveReferencesResult {
  resolved: DocSpec;
  unresolved: UnresolvedRef[];
}

export function resolveDocSpecReferences(
  spec: DocSpec,
  facts: DerivedFacts,
): ResolveReferencesResult {
  const unresolved: UnresolvedRef[] = [];

  if (spec.variants) {
    const familyValues = facts.familyAxis.values;
    for (const key of Object.keys(spec.variants)) {
      if (!familyValues.includes(key)) {
        unresolved.push({
          slot: "variants",
          kind: "familyValue",
          value: key,
          didYouMean: didYouMean(key, familyValues),
        });
      }
    }
  }

  return { resolved: spec, unresolved };
}
