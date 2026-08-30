/**
 * The one id-minting function for this module: sprint ids, note ids and a
 * publish identity all come from here, so there is one collision guarantee in
 * release-notes rather than several.
 *
 * A sprint id doubles as the storage key its content is written under, so two
 * sprints minted in the same millisecond used to overwrite each other. By hand
 * that needs an improbable coincidence; under the automation this module is
 * built for, it is ordinary.
 *
 * `mintId` takes the current time as an argument instead of reading the clock,
 * which is what makes it testable against a fixed instant and matches how the
 * rest of this repository keeps decisions pure. A module-scoped counter is
 * what makes two calls at the same instant differ - `now` alone cannot, since
 * a millisecond is not fine enough for how fast automation can call this.
 *
 * The id keeps a readable time component (`now` in base 36) so a stored key
 * can still be traced back to when it was minted, with the counter appended as
 * the distinguishing component. That readability is a debugging property, not
 * a correctness one: the counter is what guarantees two ids never collide.
 *
 * Existing stored ids (plain decimal milliseconds, no dash) are untouched by
 * this change and remain valid storage keys - this only changes how a *new*
 * id is produced, never the shape of one already on file.
 */
let sequence = 0;

export function mintId(now: number): string {
  sequence += 1;
  return `${now.toString(36)}-${sequence.toString(36)}`;
}

/**
 * The instant a `mintId` id was minted at, for ordering ids against each
 * other. A legacy plain-decimal id (no dash) is read as a decimal number, the
 * way callers already did before this change, so ordering across old and new
 * ids stays sensible without a migration.
 *
 * The two formats are told apart by the dash, which is a property of how they
 * are built, rather than by trying a decimal parse and falling back. Parsing
 * cannot tell them apart in general: a base-36 time component made only of
 * digits would parse as a decimal and give a wildly wrong instant. Today that
 * cannot happen, because an epoch millisecond between 1994 and 2059 is eight
 * base-36 characters whose first is always a letter - but that is an accident
 * of the alphabet and the era, not a guarantee, and it expires in 2059.
 */
export function idMintedAt(id: string): number {
  const dash = id.indexOf("-");
  if (dash === -1) return Number(id);
  return parseInt(id.slice(0, dash), 36);
}
