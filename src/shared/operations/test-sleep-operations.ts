// Test-only Operations that do nothing but sleep in cancellable units (#192).
//
// #183 built the route from a Bridge timeout to a running Operation's
// cancellation token. #184 made `tidy_ds_template_run` the first adopter.
// Neither has ever been observed working against a real file: the only way to
// trigger the path is to make a real Operation exceed its budget, and every
// live attempt used macOS's throttling of an unfocused Electron window as the
// lever - it never came close to slowing a ~20s run past its 120s budget, and
// cost 116 stray pages in a test file for no knowledge at all.
//
// These three Operations exist to make the trigger exercisable on demand,
// deterministically, without writing anything to a Figma file:
//
//   - `tidy_test_sleep_cancellable` - declares `cancellable: true` and
//     actually checks the token between units (`runUntilCancelled`, the same
//     helper every real adopter takes). Call it with `durationMs` longer than
//     its Bridge budget and the timeout fires on schedule: the Bridge sends a
//     cancel, the registry marks this run's token, the loop stops at its next
//     checkpoint, and `requestCancellation` reports `stopped`.
//   - `tidy_test_sleep_ignore_token` - also declares `cancellable: true`, but
//     the handler never reads `ctx.cancellation` at all. This is what an
//     honest-but-wrong declaration looks like: the registry still marks the
//     token (a cancel is sent), but nothing in the loop ever looks at it, so
//     the run keeps going for its full `durationMs` regardless. Cancelling it
//     deterministically produces `still_running` - not by racing the grace
//     window against a checkpoint, but because there genuinely is no
//     checkpoint to reach. (`tidy_test_sleep_cancellable` can also produce
//     `still_running`, non-deterministically, if `unitMs` is set larger than
//     the cancellation grace - see its summary.)
//   - `tidy_test_sleep_uncancellable` - omits `cancellable` entirely, the
//     honest case: the registry never marks a token for it in the first
//     place (`entry.cancellable` is false), so `requestCancellation` answers
//     `not_cancellable` immediately without waiting on anything, and the run
//     is left going to completion.
//
// `not_running`, the fourth `CancellationStatus`, needs no special operation
// at all: it is what `requestCancellation` answers for any requestId that
// names a run which already finished (or never existed) - see
// `registry.test.ts` for that case exercised generically.
//
// EXPOSURE DECISION (the acceptance criterion this comment exists to satisfy):
//
// These are registered here, in the plugin-thread registry, UNCONDITIONALLY.
// That is deliberate, not an oversight: a handler that only sleeps in
// setTimeout units, touches no Figma API, and does no reading or writing to
// the document is inert cargo sitting in the registry map - the exact same
// cost as any other side-effect import in register-all.ts. Gating it here
// would need either a build-time flag (this thread has no separate dev
// build - esbuild.config.cjs bakes NODE_ENV to "production" unconditionally,
// in the one build script that ships) or a runtime env var (there is no
// `process` global in the Figma plugin sandbox at all; reading
// `process.env.ANYTHING` here would throw at load, in a side-effect import
// every module pulls in unconditionally). Both routes are unavailable at this
// layer without editing shared build config outside this ticket's scope.
//
// The actual exposure gate is one layer up, in `mcp-server/src/catalogue.ts`,
// which is a real Node process with real environment variables and no
// build-time bake. These three ids are added to the exported `CATALOGUE` only
// when `TIDY_ENABLE_TEST_OPERATIONS=1` is set in the server's environment -
// see that file's comment. That is the layer an agent actually reaches
// through: the MCP tool list is built 1:1 from `CATALOGUE`
// (`mcp-server/src/server.ts`), so an id absent from it is not a tool at all,
// and there is no other route from an agent's conversation into a plugin
// Operation. Being dispatchable-in-principle at this layer (e.g. by a raw
// BridgeRequest a human sends by hand while verifying this ticket) is exactly
// the property the manual verification procedure needs, and it costs a
// production session nothing: without the env var, no agent's tool list ever
// contains these three ids, on a designer's file or anywhere else.

import { ErrorCode, OperationError } from "./errors";
import { registerOperation } from "./registry";
import { runUntilCancelled } from "../cancellation";

/** Ceiling on `durationMs` - long enough to outlast any real Bridge budget in
 * this catalogue (the longest today is 120s), short enough that a mistaken
 * call cannot leave the plugin's single-Operation slot occupied indefinitely. */
const MAX_DURATION_MS = 10 * 60_000;
const DEFAULT_UNIT_MS = 250;
const MAX_UNIT_MS = 60_000;

interface SleepParams {
  /** Total time to sleep, in ms. Validated against MAX_DURATION_MS. */
  durationMs: number;
  /**
   * Checkpoint granularity, in ms. Defaults to 250. Larger values mean fewer,
   * coarser checkpoints - useful for deliberately producing `still_running`
   * on `tidy_test_sleep_cancellable` by setting this above the cancellation
   * grace (`CANCEL_GRACE_MS`, 2000ms by default) so the run is mid-unit when
   * the grace window closes.
   */
  unitMs?: number;
}

interface SleepResult {
  requestedDurationMs: number;
  unitMs: number;
  unitsRequested: number;
  /** How many whole units actually elapsed before the handler returned. */
  unitsCompleted: number;
  /** True only for the cancellable handler, and only when it actually
   * stopped early having seen the token cancelled. */
  cancelled: boolean;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function validate(params: SleepParams): { durationMs: number; unitMs: number } {
  const durationMs = params?.durationMs;
  if (
    typeof durationMs !== "number" ||
    !Number.isFinite(durationMs) ||
    durationMs <= 0
  ) {
    throw new OperationError(
      ErrorCode.INVALID_PARAMS,
      "durationMs must be a positive number",
    );
  }
  if (durationMs > MAX_DURATION_MS) {
    throw new OperationError(
      ErrorCode.INVALID_PARAMS,
      `durationMs must not exceed ${MAX_DURATION_MS}ms`,
      true,
      { max: MAX_DURATION_MS },
    );
  }
  const unitMs = params?.unitMs ?? DEFAULT_UNIT_MS;
  if (typeof unitMs !== "number" || !Number.isFinite(unitMs) || unitMs <= 0) {
    throw new OperationError(
      ErrorCode.INVALID_PARAMS,
      "unitMs must be a positive number when given",
    );
  }
  if (unitMs > MAX_UNIT_MS) {
    throw new OperationError(
      ErrorCode.INVALID_PARAMS,
      `unitMs must not exceed ${MAX_UNIT_MS}ms`,
      true,
      { max: MAX_UNIT_MS },
    );
  }
  return { durationMs, unitMs };
}

/** How many whole units `durationMs` splits into, at least one. */
function unitCount(durationMs: number, unitMs: number): number {
  return Math.max(1, Math.ceil(durationMs / unitMs));
}

registerOperation<SleepParams, SleepResult>(
  {
    id: "tidy_test_sleep_cancellable",
    kind: "execute",
    module: "test",
    summary:
      "TEST-ONLY (#192). Sleeps for durationMs, in unitMs-sized cancellable units, checking the cancellation token between each. Writes nothing to any file. Call with durationMs comfortably longer than this tool's Bridge timeout to trigger a real cancellation: the run stops at its next unit boundary and reports cancelled=true. Set unitMs above the cancellation grace (2000ms) to instead observe `still_running` - the run has a checkpoint but had not reached it yet when the grace closed.",
    paramsExample: { durationMs: 30000, unitMs: 250 },
    cancellable: true,
  },
  async (params, ctx) => {
    const { durationMs, unitMs } = validate(params);
    const units = unitCount(durationMs, unitMs);
    const { completed, cancelled } = await runUntilCancelled(
      Array.from({ length: units }, (_, i) => i),
      async () => delay(unitMs),
      ctx.cancellation,
    );
    return {
      requestedDurationMs: durationMs,
      unitMs,
      unitsRequested: units,
      unitsCompleted: completed.length,
      cancelled,
    };
  },
);

/**
 * Sleeps the same shape of loop as above, but never reads `ctx.cancellation`.
 * Declares `cancellable: true` anyway - modelling the case where an Operation
 * claims a checkpoint it does not actually have. The registry still marks its
 * token on a cancel request (nothing here prevents that), but nothing in the
 * loop looks at it, so the run always goes the distance and `stopped` can
 * never be the honest answer for it - only `still_running`, deterministically,
 * regardless of timing.
 */
async function sleepIgnoringToken(
  durationMs: number,
  unitMs: number,
): Promise<{ units: number }> {
  const units = unitCount(durationMs, unitMs);
  for (let i = 0; i < units; i++) await delay(unitMs);
  return { units };
}

registerOperation<SleepParams, SleepResult>(
  {
    id: "tidy_test_sleep_ignore_token",
    kind: "execute",
    module: "test",
    summary:
      "TEST-ONLY (#192). Declares cancellable but its loop never checks the token - models a checkpoint that was declared but not actually wired up. A cancel request always reports `still_running` for this one, deterministically, since the run never stops early. Writes nothing to any file.",
    paramsExample: { durationMs: 30000, unitMs: 250 },
    cancellable: true,
  },
  async (params, _ctx) => {
    const { durationMs, unitMs } = validate(params);
    const { units } = await sleepIgnoringToken(durationMs, unitMs);
    return {
      requestedDurationMs: durationMs,
      unitMs,
      unitsRequested: units,
      unitsCompleted: units,
      cancelled: false,
    };
  },
);

registerOperation<SleepParams, SleepResult>(
  {
    id: "tidy_test_sleep_uncancellable",
    kind: "execute",
    module: "test",
    summary:
      "TEST-ONLY (#192). Sleeps for durationMs with no cancellable declaration at all - the honest 'this Operation cannot be stopped' case. A cancel request against it reports `not_cancellable` immediately, without waiting, and the run is left going to completion. Writes nothing to any file.",
    paramsExample: { durationMs: 30000, unitMs: 250 },
    // Deliberately absent: this is the non-declaring mode.
  },
  async (params: SleepParams, _ctx) => {
    const { durationMs, unitMs } = validate(params);
    const { units } = await sleepIgnoringToken(durationMs, unitMs);
    return {
      requestedDurationMs: durationMs,
      unitMs,
      unitsRequested: units,
      unitsCompleted: units,
      cancelled: false,
    };
  },
);

// Exported for the accompanying test only, to avoid restating the ceilings.
export const __test = { MAX_DURATION_MS, MAX_UNIT_MS, DEFAULT_UNIT_MS };
