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

export function buildModeCrossProduct(
  collections: ModeCollectionFact[],
  cap = 8,
): ModeCrossProductResult {
  if (collections.length === 0) return { showcases: [], dropped: 0 };

  let combos: ModeShowcaseFact[] = [{ selections: [] }];
  for (const collection of collections) {
    const next: ModeShowcaseFact[] = [];
    for (const combo of combos) {
      for (const mode of collection.modes) {
        next.push({
          selections: [
            ...combo.selections,
            {
              collectionId: collection.id,
              collectionName: collection.name,
              modeId: mode.modeId,
              modeName: mode.name,
            },
          ],
        });
      }
    }
    combos = next;
  }

  return {
    showcases: combos.slice(0, cap),
    dropped: Math.max(0, combos.length - cap),
  };
}

export function modeShowcaseLabel(showcase: ModeShowcaseFact): string {
  return showcase.selections
    .map((selection) => `${selection.collectionName}: ${selection.modeName}`)
    .join(" · ");
}
