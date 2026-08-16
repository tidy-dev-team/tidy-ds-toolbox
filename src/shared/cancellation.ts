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
 * queue between iterations (see `yieldToMain` below) — otherwise the
 * incoming "stop" message never gets a chance to run before the loop
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

/**
 * Yields to the event loop's macrotask queue. Every cancellation-token
 * adopter must call this between loop iterations — otherwise an incoming
 * "cancel" message queued on the same macrotask queue never gets a chance
 * to run before the loop finishes on its own, and `isCancelled` is never
 * seen true mid-loop.
 */
export function yieldToMain(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

/** What a cancellable run got through before it stopped or ran out of work. */
export interface CancellableRunResult<T> {
  /** One entry per item that finished. A stopped run leaves these behind. */
  completed: T[];
  /** Whether the run stopped early. False means it covered every item. */
  cancelled: boolean;
}

/**
 * Runs `runOne` over `items` until they run out or the token is cancelled.
 *
 * The point of this existing at all is the pairing in the file header: a loop
 * must check the token *and* yield between iterations, and the yield is the
 * half that is easy to forget. Forgetting it is silent - the loop is the thing
 * preventing the cancellation message from ever running, so the token is never
 * seen cancelled and the run finishes as if nobody asked. Adopters take this
 * instead of writing the loop, so there is one place that pairing can be wrong.
 *
 * An item is never half-done: the token is read between whole items, so
 * whatever `runOne` builds is either finished or never started.
 */
export async function runUntilCancelled<I, T>(
  items: readonly I[],
  runOne: (item: I, index: number) => Promise<T>,
  token: CancellationToken,
): Promise<CancellableRunResult<T>> {
  const completed: T[] = [];
  for (let i = 0; i < items.length; i++) {
    // Checked before the work, not after, so a cancellation that arrives
    // before the first item leaves nothing behind at all.
    if (token.isCancelled) return { completed, cancelled: true };
    completed.push(await runOne(items[i], i));
    // Awaiting `runOne` is not enough: its promises are microtasks, and the
    // queue has to drain before a queued cancellation gets a turn. This gives
    // it one. Skipped after the last item, where there is nothing left to stop.
    if (i < items.length - 1) await yieldToMain();
  }
  return { completed, cancelled: false };
}
