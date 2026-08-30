/**
 * What a stopped DS Explorer run tells the designer (#185).
 *
 * By the time a stop arrives, the Bridge has already answered the caller, so
 * this sentence is the only account of the stop that reaches anybody - same
 * audience and reasoning as the DS Template's `describeStoppedRun` (#184).
 */

/**
 * The place-set Operation stops in exactly one place: after the import,
 * before the clone. Nothing is in the document yet, so the message is short
 * by construction - there is no partial state to describe, and the right
 * next action is simply to run it again.
 */
export function describeStoppedPlaceSet(componentName: string): string {
  return (
    `Placing '${componentName}' was stopped before anything was placed - ` +
    `the canvas is unchanged. ` +
    `Run it again to place the set.`
  );
}
