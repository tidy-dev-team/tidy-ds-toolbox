// Pure helpers for the Mode Section. Figma API adapters live in deriveFacts.ts
// and buildModeSection.ts; this file stays plain-data so cross-product/cap
// behaviour is unit-testable.

export interface ModeFact {
  modeId: string;
  name: string;
}

export interface ModeCollectionFact {
  id: string;
  name: string;
  defaultModeId: string;
  modes: ModeFact[];
}

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

// The primary theme collection to drive the Mode Section: the collection with
// the most modes, tie-broken by derivation order (first wins). Crossing every
// bound collection (the old behaviour) exploded meaningless combinations — a
// component bound to a theme collection, a light/dark collection, and a unit
// (rem/px) collection produced their full cartesian product, and the showcase
// cap then hid the very variation it was meant to show. A theme collection
// (brand × scheme) is almost always the widest, so "most modes" picks it and
// leaves the incidental collections at their default mode.
export function selectPrimaryCollection(
  collections: ModeCollectionFact[],
): ModeCollectionFact | null {
  let best: ModeCollectionFact | null = null;
  for (const collection of collections) {
    if (best === null || collection.modes.length > best.modes.length) {
      best = collection;
    }
  }
  return best;
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
