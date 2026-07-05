// Reference resolution (ADR-0008): the Doc Spec carries symbolic references
// to derived facts rather than the facts themselves. Structural Zod
// validation (docSpec.ts) runs first and fails fast; this runs second and
// collects *every* unresolved reference into one batched payload rather than
// failing on the first (ADR-0003).
//
// Resolves `variants` keys (against the family axis), `guidelines.doDonts`
// SpecimenScene props (axis-value refs against categorised axes), and
// `related` keys (against the ranked sibling-candidate list). Mode reference
// kinds land with the Mode Section.

import type { DocSpec, SpecimenScene } from "./docSpec";
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

// The categorised axes a SpecimenScene's `props` may reference by name — the
// only axes for which facts carries a full value set to validate against.
function resolvableAxes(facts: DerivedFacts): Map<string, string[]> {
  const axes = new Map<string, string[]>();
  if (facts.familyAxis.name) {
    axes.set(facts.familyAxis.name, facts.familyAxis.values);
  }
  if (facts.stateAxis?.name) {
    axes.set(facts.stateAxis.name, facts.stateAxis.values);
  }
  if (facts.sizeAxis?.name) {
    axes.set(facts.sizeAxis.name, facts.sizeAxis.values);
  }
  return axes;
}

function resolveSpecimenScene(
  scene: SpecimenScene,
  axes: Map<string, string[]>,
  slotPrefix: string,
  unresolved: UnresolvedRef[],
): void {
  scene.instances.forEach((instance, index) => {
    for (const [axisName, value] of Object.entries(instance.props)) {
      const values = axes.get(axisName);
      if (!values) {
        unresolved.push({
          slot: `${slotPrefix}.instances[${index}].props`,
          kind: "axisName",
          value: axisName,
          didYouMean: didYouMean(axisName, [...axes.keys()]),
        });
        continue;
      }
      if (!values.includes(value)) {
        unresolved.push({
          slot: `${slotPrefix}.instances[${index}].props.${axisName}`,
          kind: "axisValue",
          value,
          didYouMean: didYouMean(value, values),
        });
      }
    }
  });
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

  if (spec.guidelines?.doDonts) {
    const axes = resolvableAxes(facts);
    spec.guidelines.doDonts.forEach((pair, index) => {
      resolveSpecimenScene(
        pair.good,
        axes,
        `guidelines.doDonts[${index}].good`,
        unresolved,
      );
      resolveSpecimenScene(
        pair.bad,
        axes,
        `guidelines.doDonts[${index}].bad`,
        unresolved,
      );
    });
  }

  if (spec.related) {
    const candidateNames = facts.relatedCandidates.map((c) => c.name);
    for (const key of Object.keys(spec.related)) {
      if (!candidateNames.includes(key)) {
        unresolved.push({
          slot: "related",
          kind: "siblingName",
          value: key,
          didYouMean: didYouMean(key, candidateNames),
        });
      }
    }
  }

  return { resolved: spec, unresolved };
}
