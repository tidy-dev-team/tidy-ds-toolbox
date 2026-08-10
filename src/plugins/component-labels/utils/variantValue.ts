/**
 * Read one variant property value out of a variant's name.
 *
 * A variant is named `Prop=Value, Other=Value`. The key is matched whole:
 * a substring match would let the property "Size" read the value of
 * "Icon Size", and answer with a value from the wrong axis.
 */
export function extractVariantValue(
  variantName: string,
  propertyName: string,
): string {
  if (!propertyName) return "";

  for (const part of variantName.split(",")) {
    const separator = part.indexOf("=");
    if (separator === -1) continue;
    if (part.slice(0, separator).trim() !== propertyName) continue;
    return part.slice(separator + 1).trim();
  }

  return "";
}
