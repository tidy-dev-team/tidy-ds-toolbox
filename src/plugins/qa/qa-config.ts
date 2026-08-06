/**
 * Kido DS conventions for the QA engine, baked in as named constants
 * (issue #76: hybrid config — no runtime overrides in v1). When conventions
 * change, this file is the only place to touch.
 */

/**
 * #2 — component set master names must be PascalCase (`Button`,
 * `NotificationTag`) or kebab-case (`notification-tag`). Design named both
 * forms as legal and nothing else, so the two are kept as separate patterns
 * rather than one permissive regex: the check reports which forms were
 * expected, and a single alternation would leave that message guessing.
 *
 * A bare lowercase word (`button`) matches neither, deliberately. It is
 * indistinguishable from a one-word kebab name by shape alone, and design
 * ruled it an error, so the narrower kebab pattern requires at least one dash.
 */
export const SET_NAME_PASCAL_PATTERN = /^[A-Z][a-zA-Z0-9]*$/;
export const SET_NAME_KEBAB_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)+$/;

/** The legal forms, phrased once for the #2 finding's `expected`. */
export const SET_NAME_EXPECTED =
  "PascalCase (Button, NotificationTag) or kebab-case (notification-tag)";

export function isLegalSetName(name: string): boolean {
  return (
    SET_NAME_PASCAL_PATTERN.test(name) || SET_NAME_KEBAB_PATTERN.test(name)
  );
}

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

/**
 * #11 - the variant property value that means "this set has a hover state".
 * Compared case-insensitively against every variant property value, because
 * the property holding it is not fixed: `State=hover` is the common shape here,
 * but the same value appears under other property names in other files.
 *
 * The set declaring a hover state is what makes #11 applicable at all (design,
 * 2026-08-04): a set with no hover state is not asked about its triggers.
 */
export const HOVER_STATE_VALUE = "hover";

/** #12 — required alias line in the component description. */
export const ALSO_KNOWN_AS_PREFIX = "Also known as:";

/**
 * #12 - how a Storybook link is recognised, in the description text or in
 * Figma's documentation-link field.
 *
 * Matched on the word rather than on a fixed host, because Storybook is
 * self-hosted per project and there is no one domain to name. It requires a URL,
 * not a mention, so prose that merely says "see Storybook" does not satisfy the
 * recommendation.
 *
 * **Known false negative, and the reason this stays advisory.** A Storybook on a
 * custom domain need not carry the word anywhere -
 * `https://design.acme.com/?path=/story/button--primary` is a real shape that
 * this misses, and it is reported as having no link. That is tolerable only
 * because the finding is a `low` recommendation that cannot fail the row: a
 * reader who has a link sees advice they can ignore. It would not be tolerable
 * for a rule that gated anything, and if these turn up in practice the fix is a
 * configured host rather than a cleverer pattern.
 */
export const STORYBOOK_URL_PATTERN = /https?:\/\/\S*storybook\S*/i;
export const STORYBOOK_HINT = /storybook/i;

/**
 * #14 — max allowed depth of an exposed nested-instance chain before it warns
 * for cluttering the parent configuration panel.
 */
export const NESTING_DEPTH_WARN_THRESHOLD = 2;
