// Pure axis-categorisation logic for tidy-doc. No Figma types — operates on
// plain variant-prop descriptors so it can be unit tested without a Figma
// runtime (mirrors src/plugins/color-finder/utils/categorize.ts).
//
// Widens sticker-sheet-builder's getProps() (utils/getAllVariantProps.ts)
// value-bucketing into a dedicated categoriser for tidy-doc's Variant Family
// concept (CONTEXT.md). Family/state axes are recognised by the *values*
// they contain, not just the axis name; ambiguity among type-like axes is
// resolved by a fixed name precedence (Type > Kind > Variant), then
// declaration order.

export interface AxisDescriptor {
  name: string;
  values: string[];
  defaultValue?: string;
}

export interface Axis {
  name: string | null;
  values: string[];
}

export interface CategorizationResult {
  familyAxis: Axis;
  stateAxis: Axis | null;
  sizeAxis: Axis | null;
  demoted: string[];
  pinnedDefaults: Record<string, string>;
}

const STATE_VALUE_VOCAB = new Set([
  "hover",
  "idle",
  "pressed",
  "active",
  "focus",
  "focused",
  "disabled",
  "selected",
  "default",
  "rest",
  "error",
  "regular",
]);

// Widened from sticker-sheet-builder's getProps() (utils/getAllVariantProps.ts
// `typeOptions = ["primary", "secondary"]`) so a "Kind"/"Style"/… axis is
// recognised as type-like by its values, not only by its name.
const TYPE_VALUE_VOCAB = new Set([
  "primary",
  "secondary",
  "tertiary",
  "ghost",
  "outline",
  "outlined",
  "filled",
  "solid",
  "subtle",
  "link",
  "text",
  "danger",
  "warning",
  "success",
  "info",
  "neutral",
  "brand",
  "accent",
  "destructive",
  "critical",
]);

const FAMILY_NAME_PRECEDENCE = ["type", "kind", "variant"];

function lower(values: string[]): string[] {
  return values.map((v) => v.toLowerCase());
}

function looksLikeState(descriptor: AxisDescriptor): boolean {
  if (descriptor.name.toLowerCase() === "state") return true;
  return lower(descriptor.values).some((v) => STATE_VALUE_VOCAB.has(v));
}

function looksLikeType(descriptor: AxisDescriptor): boolean {
  if (FAMILY_NAME_PRECEDENCE.includes(descriptor.name.toLowerCase())) {
    return true;
  }
  return lower(descriptor.values).some((v) => TYPE_VALUE_VOCAB.has(v));
}

function pinnedDefaultFor(descriptor: AxisDescriptor): string {
  if (descriptor.defaultValue && descriptor.values.includes(descriptor.defaultValue)) {
    return descriptor.defaultValue;
  }
  return descriptor.values[0];
}

/**
 * Categorise a component's variant axes into family/state/size buckets.
 * Rest-state (non-spanned) axes are pinned to a single value each, since
 * v1 renders one specimen per family value with no state-spanning row.
 */
export function categorizeAxes(
  descriptors: AxisDescriptor[],
): CategorizationResult {
  const sizeDescriptor = descriptors.find(
    (d) => d.name.toLowerCase() === "size",
  );
  const stateDescriptor = descriptors.find(
    (d) => d !== sizeDescriptor && looksLikeState(d),
  );

  const remaining = descriptors.filter(
    (d) => d !== sizeDescriptor && d !== stateDescriptor,
  );

  const pinnedDefaults: Record<string, string> = {};
  const demoted: string[] = [];
  let familyAxis: Axis;

  if (remaining.length === 0) {
    familyAxis = { name: null, values: ["default"] };
  } else if (remaining.length === 1) {
    // By elimination the sole non-size/non-state axis is the family axis —
    // there is no other candidate to compare it against.
    const [only] = remaining;
    familyAxis = { name: only.name, values: only.values };
  } else {
    const typeCandidates = remaining.filter(looksLikeType);

    if (typeCandidates.length === 0) {
      // No axis categorises as type-like by name or value: never promote an
      // arbitrary axis to family. Every remaining axis is pinned instead.
      familyAxis = { name: null, values: ["default"] };
      for (const d of remaining) {
        pinnedDefaults[d.name] = pinnedDefaultFor(d);
      }
    } else {
      const byPrecedence = FAMILY_NAME_PRECEDENCE.map((wanted) =>
        typeCandidates.find((d) => d.name.toLowerCase() === wanted),
      ).find((d): d is AxisDescriptor => Boolean(d));
      const chosen = byPrecedence ?? typeCandidates[0];
      familyAxis = { name: chosen.name, values: chosen.values };

      for (const d of remaining) {
        if (d !== chosen) {
          demoted.push(d.name);
          pinnedDefaults[d.name] = pinnedDefaultFor(d);
        }
      }
    }
  }

  if (stateDescriptor) {
    pinnedDefaults[stateDescriptor.name] = pinnedDefaultFor(stateDescriptor);
  }
  if (sizeDescriptor) {
    pinnedDefaults[sizeDescriptor.name] = pinnedDefaultFor(sizeDescriptor);
  }

  return {
    familyAxis,
    stateAxis: stateDescriptor
      ? { name: stateDescriptor.name, values: stateDescriptor.values }
      : null,
    sizeAxis: sizeDescriptor
      ? { name: sizeDescriptor.name, values: sizeDescriptor.values }
      : null,
    demoted,
    pinnedDefaults,
  };
}
