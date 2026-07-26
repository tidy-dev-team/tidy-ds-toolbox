// Pure helpers for the Mode Section. Figma API adapters live in deriveFacts.ts
// and buildModeSection.ts; this file stays plain-data so cross-product/cap
// behaviour is unit-testable.

import {
  selectPrimaryCollection,
  type ModeCollectionFact,
} from "../../../shared/theme-collection";

export type {
  ModeFact,
  ModeCollectionFact,
} from "../../../shared/theme-collection";
export { selectPrimaryCollection } from "../../../shared/theme-collection";

export interface ModeSelectionFact {
  collectionId: string;
  collectionName: string;
  modeId: string;
  modeName: string;
}

export interface ModeShowcaseFact {
  selections: ModeSelectionFact[];
}

export interface ModeCrossProductResult {
  showcases: ModeShowcaseFact[];
  dropped: number;
}

// One showcase per mode of the primary collection; every other bound collection
// is left at its default mode (not pinned). Capped like before, though a single
// collection rarely exceeds the cap.
export function buildModeShowcases(
  collections: ModeCollectionFact[],
  cap = 8,
): ModeCrossProductResult {
  const primary = selectPrimaryCollection(collections);
  if (!primary) return { showcases: [], dropped: 0 };

  const showcases: ModeShowcaseFact[] = primary.modes.map((mode) => ({
    selections: [
      {
        collectionId: primary.id,
        collectionName: primary.name,
        modeId: mode.modeId,
        modeName: mode.name,
      },
    ],
  }));

  return {
    showcases: showcases.slice(0, cap),
    dropped: Math.max(0, showcases.length - cap),
  };
}

export function modeShowcaseLabel(showcase: ModeShowcaseFact): string {
  return showcase.selections
    .map((selection) => `${selection.collectionName}: ${selection.modeName}`)
    .join(" · ");
}
