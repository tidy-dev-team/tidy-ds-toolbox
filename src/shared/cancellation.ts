/**
 * A plain cooperative-cancellation token (#167).
 *
 * No Figma dependency — a loop anywhere (plugin thread or otherwise) can
 * check `.isCancelled` between items and stop early once something calls
 * `.cancel()`. Figma's sandbox has no way to actually interrupt a running
 * handler, so this is the only kind of "stop" available: the loop has to
 * ask, between iterations, whether it should keep going.
 *
 * For that check to ever see a cancellation requested while the plugin
 * thread is mid-loop, the loop must also yield to the event loop's macrotask
 * queue between iterations (see `yieldToMain` in each adopter) — otherwise
 * the incoming "stop" message never gets a chance to run before the loop
 * finishes on its own.
 */
export interface CancellationToken {
  /** Whether `cancel()` has been called on this token. */
  readonly isCancelled: boolean;
  /** Marks the token cancelled. Idempotent — safe to call more than once. */
  cancel(): void;
}

/** Creates a fresh token, not cancelled. */
export function createCancellationToken(): CancellationToken {
  let cancelled = false;
  return {
    get isCancelled() {
      return cancelled;
    },
    cancel() {
      cancelled = true;
    },
  };
}
