/**
 * What a stopped QA checklist build tells the designer (#185).
 *
 * By the time a stop arrives, the Bridge has already answered the caller, so
 * this sentence is the only account of the stop that reaches anybody - same
 * audience and reasoning as the DS Template's `describeStoppedRun` (#184).
 *
 * The Operation's stop boundaries all sit before the first prior block is
 * removed, so a stopped run has changed nothing on the canvas and there is
 * no partial frame to describe. That is why the message is short by
 * construction: it promises the invariant the boundaries were chosen to keep,
 * and re-running is the ordinary recovery, because a build is idempotent per
 * target - it replaces the prior checklist whether or not a stop happened.
 */
export function describeStoppedChecklistRun(targetName: string | null): string {
  const subject = targetName ? ` for '${targetName}'` : "";
  return (
    `QA checklist${subject} stopped before drawing. ` +
    `Nothing on the canvas changed - any previous checklist is untouched. ` +
    `Running it again is safe: it replaces the prior checklist, as it always does.`
  );
}
