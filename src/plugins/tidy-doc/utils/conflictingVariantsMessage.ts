// Designer-facing wording for a component set Figma has flagged as having a
// conflicting variant combination (#188). Kept in the same voice as the QA
// engine's `no-conflicts` check (src/plugins/qa/checks/no-conflicts.ts),
// which already describes this exact defect to a designer - "in
// get_variantProperties: ..." is a Figma API internal, not a second
// vocabulary to invent.
//
// Pure: a string in, a string out. No Figma, no OperationError - the caller
// decides how to throw it.
//
// `reason` is expected to be fit to print already. `readVariantProperties`
// strips Figma's `in <fn>: ` prefix where the throw becomes a value, so this
// does not strip it again: one sanitisation point cannot disagree with itself,
// two can.
export function conflictingVariantsMessage(
  componentSetName: string,
  reason: string,
): string {
  return (
    `"${componentSetName}" has a conflicting variant combination that Figma ` +
    `refused to report (${reason}). Open the Variants panel in Figma, fix the ` +
    `duplicate, and document it again.`
  );
}
