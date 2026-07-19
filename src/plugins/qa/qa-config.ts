/**
 * Kido DS conventions for the QA engine, baked in as named constants
 * (issue #76: hybrid config — no runtime overrides in v1). When conventions
 * change, this file is the only place to touch.
 */

/** #2 — component set master names must be PascalCase (`Button`, `NotificationTag`). */
export const SET_NAME_PATTERN = /^[A-Z][a-zA-Z0-9]*$/;

/**
 * #4 — canonical relative order of known variant props. Only the relative
 * order of the props actually present is enforced; unknown props may trail.
 */
export const CANONICAL_PROP_ORDER: readonly string[] = [
  "Size",
  "Variant",
  "State",
];

/** #9a — default Figma layer names to reject (checked case-sensitively). */
export const DEFAULT_LAYER_NAME_PATTERN =
  /^(Frame|Group|Vector|Rectangle|Ellipse|Line|Polygon|Star|Arrow|Component|Instance|Union|Subtract|Intersect|Exclude|Slice|Boolean|Text)( \d+)?$/;

/**
 * #10 — a spatial value is on-grid when it is a multiple of GRID_UNIT or
 * exactly GRID_EXCEPTION (2✓ 4✓ 6✗ 8✓ 10✗ 12✓ …). Applied uniformly.
 */
export const GRID_UNIT = 4;
export const GRID_EXCEPTION = 2;

export function isOnGrid(value: number): boolean {
  return value % GRID_UNIT === 0 || value === GRID_EXCEPTION;
}

/** #11 — the only prototype trigger allowed inside the library. */
export const ALLOWED_TRIGGER_TYPES: readonly string[] = ["ON_HOVER"];

/** #12 — required alias line in the component description. */
export const ALSO_KNOWN_AS_PREFIX = "Also known as:";
