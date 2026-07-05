// Plain-data shape for a component's derived facts. Deliberately free of any
// Figma type so pure modules (resolveReferences, and this module's own
// tests) can depend on it without pulling in the Figma runtime.

import type { CategorizationResult } from "./categorizeAxes";
import type { IconPlacementFact, SizeMeasurement, WidthFact } from "./anatomy";
import type { RelatedCandidate } from "./rankRelatedCandidates";
import type { ModeCollectionFact } from "./modes";

export interface BreakdownFacts {
  heights: SizeMeasurement[];
  width: WidthFact | null;
  iconPlacement: IconPlacementFact | null;
}

export interface DerivedFacts extends CategorizationResult {
  componentId: string;
  componentName: string;
  breakdown: BreakdownFacts;
  modeCollections: ModeCollectionFact[];
  relatedCandidates: RelatedCandidate[];
}
