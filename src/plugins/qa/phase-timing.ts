/**
 * Phase timings for a QA run, and the wrapper that logs them.
 *
 * #213 batched a set of per-item costs on the strength of counted round trips
 * and locally measured durations, not of anything the plugin itself reported.
 * That is a thin footing for the next change of the same kind: the sandbox is
 * where these costs are actually paid, and it is the one place none of the
 * measurement happened.
 *
 * So a run says where its time went. Deliberately a log line rather than a
 * field on `QaRunResult`: the numbers are for whoever is making the plugin
 * faster, and the Operation result is an agent-facing contract that should not
 * grow a diagnostic that every caller then has to ignore.
 *
 * The clock is injected so the formatting is testable without real time.
 */

import { createLogger } from "../../shared/logging";

const logger = createLogger("QA");

interface Phase {
  name: string;
  /** Absolute clock reading when the phase began. */
  startedAt: number;
  /** Absolute clock reading when it ended, whether it returned or threw. */
  endedAt: number;
  failed: boolean;
}

export interface PhaseTimer {
  /**
   * Runs `work`, records how long it took, and returns its value.
   *
   * Takes sync or async work. Not every phase worth naming is asynchronous -
   * running the checks is pure, and knowing it costs 3ms against a 500ms
   * snapshot is exactly the signal that says where to look - and making callers
   * write `async () => pureThing()` to fit an async-only signature would put a
   * promise in the way of saying so.
   */
  phase<T>(name: string, work: () => T | Promise<T>): Promise<T>;
  /** One line naming each phase in the order it ran, plus the total. */
  summary(): string;
}

export function createPhaseTimer(now: () => number = Date.now): PhaseTimer {
  const phases: Phase[] = [];

  return {
    async phase(name, work) {
      const started = now();
      // A phase that threw is recorded before the error is re-thrown. A failing
      // run is the one most worth timing, because the phase it died in is the
      // phase to look at, and letting the throw skip the record hides exactly
      // that.
      let failed = false;
      try {
        return await work();
      } catch (error) {
        failed = true;
        throw error;
      } finally {
        phases.push({ name, startedAt: started, endedAt: now(), failed });
      }
    },

    summary() {
      if (phases.length === 0) return "no phases timed";
      // Wall-clock span, not the sum of the phases. Phases nest - the canvas
      // operation times the composition, and the composition times the one
      // document traversal inside it - so summing would count the inner phase
      // twice and report a total longer than the run took.
      const span =
        Math.max(...phases.map((p) => p.endedAt)) -
        Math.min(...phases.map((p) => p.startedAt));
      const parts = phases.map(
        (p) =>
          `${p.name} ${Math.round(p.endedAt - p.startedAt)}ms${
            p.failed ? " (failed)" : ""
          }`,
      );
      return `${parts.join(", ")} (total ${Math.round(span)}ms)`;
    },
  };
}

/**
 * Times one Operation's phases and logs where the run's time went.
 *
 * At debug level, which is off by default per this repo's logging convention -
 * these numbers are for whoever is making the plugin faster, and a run a
 * designer triggered should not print diagnostics. Turn it on from the Figma dev
 * console with `__tidyEnableDebugLogging()`, which `code.ts` exposes for exactly
 * this; there is no other route, and a log nobody can switch on measures
 * nothing.
 *
 * The log happens in a `finally`, so a run that threw still reports which phase
 * it died in. That is the run whose timings matter most.
 */
export async function timedRun<T>(
  operationId: string,
  body: (timer: PhaseTimer) => Promise<T>,
): Promise<T> {
  const timer = createPhaseTimer();
  try {
    return await body(timer);
  } finally {
    logger.debug(`${operationId}: ${timer.summary()}`);
  }
}
