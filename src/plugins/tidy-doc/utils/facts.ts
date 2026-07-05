// Plain-data shape for a component's derived facts. Deliberately free of any
// Figma type so pure modules (resolveReferences, and this module's own
// tests) can depend on it without pulling in the Figma runtime.

import type { CategorizationResult } from "./categorizeAxes";

export interface DerivedFacts extends CategorizationResult {
  componentId: string;
  componentName: string;
}
