// Wording for a Bridge call that exceeded its budget, derived from the
// catalogue entry's declared `kind` rather than hand-typed per Operation.

import type { OperationKind } from "../../src/shared/operations/types.ts";

/**
 * Why the unfocused-window sentence is in both messages: the Figma desktop app
 * is Electron-based, and macOS throttles a background window until the plugin
 * sandbox stops making progress. That is a real and common cause of these
 * timeouts, so the message keeps saying so. What differs is the advice that
 * follows it: a Query can simply be called again, an Execute must not be.
 */
const THROTTLE_CAUSE =
  "A common cause is the Figma desktop app not being the focused/foreground " +
  "window: macOS throttles it and stalls plugin execution.";

/**
 * Constructs the TIMEOUT message an agent receives when a Bridge call exceeds
 * its budget.
 *
 * Execute Operations: the timeout stopped nothing, so the message says the
 * work continues, that the file may still be being written, and that the
 * canvas should be checked before calling again. It never advises a retry -
 * a second `tidy_ds_template_run` while the first is still stamping pages
 * writes the file twice.
 * Query Operations: a plain failure. A read that stopped being waited on
 * changed nothing, so there is nothing to warn about and nothing to check.
 * Plan Operations take the same wording, and deliberately rather than by
 * falling through the `execute` branch: CONTEXT.md defines a Plan as taking
 * intent and returning an inspectable JSON plan, so it applies nothing to the
 * file and "nothing was changed" is true of it. None exists yet (ADR-0001
 * splits plan from execute; today's catalogue is queries and executes only),
 * so the first one added inherits a correct message rather than a guess.
 * Only `execute` may claim the file is still being written.
 *
 * Neither wording implies a cancellation, because nothing is cancelled here.
 * Cancellation is tracked separately (#178).
 *
 * Pure - no socket, no plugin, no Figma.
 */
export function buildTimeoutMessage(
  operation: string,
  kind: OperationKind,
  timeoutMs: number,
): string {
  const opened = `Operation '${operation}' did not respond within ${timeoutMs}ms.`;

  if (kind === "execute") {
    return (
      `${opened} The work was not called off: the plugin is still running it ` +
      `and may still be writing to the file. Do not call it again yet - ` +
      `check the canvas in Figma first, so you don't start a second run ` +
      `against the same file. ${THROTTLE_CAUSE} Bringing Figma to the front ` +
      `lets the run in progress finish.`
    );
  }

  return (
    `${opened} The call failed and nothing in the file was changed. ` +
    `${THROTTLE_CAUSE} Bring Figma to the front and call it again.`
  );
}
