// Pure theme-collection selection, shared between tidy-doc and QA — both need
// to agree on what "the theme" is. Promoted out of tidy-doc's utils (issue
// #100) so QA (which must not import across plugin boundaries) can reuse it.

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

// The primary theme collection: the collection with the most modes, tie-broken
// by derivation order (first wins). Crossing every bound collection (the old
// behaviour) exploded meaningless combinations — a component bound to a theme
// collection, a light/dark collection, and a unit (rem/px) collection produced
// their full cartesian product, and a cap then hid the very variation it was
// meant to show. A theme collection (brand × scheme) is almost always the
// widest, so "most modes" picks it and leaves the incidental collections at
// their default mode.
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
