// Reference resolution (ADR-0008): the Doc Spec carries symbolic references
// to derived facts (here, family-axis values) rather than the facts
// themselves. Structural Zod validation (docSpec.ts) runs first and fails
// fast; this runs second and collects *every* unresolved reference into one
// batched payload rather than failing on the first (ADR-0003).
//
// v1 resolved only `variants` keys. #56 adds `guidelines.doDonts`: each
// Do/Don't pair's good/bad SpecimenScene carries axis-value refs in its
// instances' `props` — bare `{ axisName: value }` pairs resolved against the
// component's *categorised* axes (family/state/size), per ADR-0008's
// "references are bare-by-position; the slot declares the kind." An unknown
// axis name and an unknown value on a known axis are distinct failure modes
// so the batched payload stays actionable. Sibling/mode reference kinds land
// with the Sections that use them.

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

  return { resolved: spec, unresolved };
}
