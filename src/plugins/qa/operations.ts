// Operation handlers for the QA engine (issue #76). Registered into the
// global Operation registry at module load via
// src/shared/operations/register-all.ts.
//
// Single agent-facing surface: `tidy_qa_run`. Returns structured CheckResults
// plus a 19-item ChecklistReport (PRD catalogue merge). The checks never touch
// the component set. The document writes in a run are both transient probe
// frames, removed before the call returns: the per-mode resolution probe
// (theme-probe.ts) and the resize probe (resize-probe.ts), which instances the
// default variant to measure what breaks. Both are the ADR-0001 carve-out.
//
// What each Operation *is* lives here - its parameters, the pipeline, the
// registration. What it draws does not: resolving a target is `subject.ts` and
// composing the canvas is `render/compose-artifacts.ts`, whose decisions are
// pure and tested in `render/compose.ts`.

import { ErrorCode, OperationError } from "../../shared/operations/errors";
import { registerOperation } from "../../shared/operations/registry";
import {
  stopRequestedAfterYield,
  type CancellationToken,
} from "../../shared/cancellation";
import { prepareSnapshot } from "./collector";
import { runChecks, unknownCheckIds } from "./checks";
import { buildChecklistReport } from "./report";
import { resolveTarget, type QaSubject } from "./subject";
import { describeStoppedChecklistRun } from "./stopMessages";
import {
  composeChecklistArtifacts,
  renderModeImage,
  type QaRun,
} from "./render/compose-artifacts";
import type { CheckId, QaRunResult } from "./types";
import { timedRun, type PhaseTimer } from "./phase-timing";
import { bindsOwnThemeVariables } from "./variable-usage";

interface QaRunParams {
  /** Figma node id of the target (instance / component / component set). */
  nodeId?: string;
  /** Alternatively: name or glob (e.g. "Button", "Notification*") matched against components/sets. */
  name?: string;
  /** Optional filter; defaults to all catalogue checks. */
  checks?: string[];
  /**
   * Render the component once per theme mode and return it as an image, so an
   * agent with no designer in the loop can actually judge row 17's visual half
   * rather than leaving a blank tick (#121 step 2).
   *
   * Off by default: it costs a render per mode, and most runs do not need it.
   */
  includeModeImages?: boolean;
}

/**
 * What a run that was asked to stop looks like inside the pipeline.
 *
 * A stopped run has written nothing - every stop boundary sits before the
 * first removal - so there is no partial QaRun to carry, only the fact of
 * the stop and, when the run got past resolving, the name of the component
 * it was about. `describeStoppedChecklistRun` turns that into the designer's
 * account.
 */
interface StoppedQaRun {
  cancelled: true;
  targetName?: string;
}

/**
 * Shared pipeline for both QA operations: validate the check filter, resolve the
 * target up to its set, collect the snapshot the requested checks need, run them,
 * and build the full QaRunResult (results + checklist). Returns the resolved
 * subject and origin node too, so the canvas op can place its frame next to the
 * instance.
 *
 * Both operations share this, deliberately: collecting or probing in only one of
 * them would leave the two QA surfaces silently disagreeing about what was
 * checked. Which snapshot facets a filtered run needs is the catalogue's business
 * rather than this module's - see `prepareSnapshot` (#134).
 *
 * `token` is how the checklist build stops (#185), and only it passes one -
 * the Query Operation is deliberately out of cancellation's scope. The token
 * is consulted at the phase boundaries and never inside a phase: each phase
 * is one unit, so a stop is observed between units and a run stopped in the
 * read half has changed nothing. The yield comes before the read, because the
 * yield is what gives an arriving stop request its turn.
 */
export async function runQa(
  params: QaRunParams,
  timer: PhaseTimer,
  token?: CancellationToken,
): Promise<QaRun | StoppedQaRun> {
  if (params.checks) {
    const unknown = unknownCheckIds(params.checks);
    if (unknown.length > 0) {
      throw new OperationError(
        ErrorCode.INVALID_PARAMS,
        `unknown check id(s): ${unknown.join(", ")}`,
        true,
        { unknown },
      );
    }
  }

  const stopPoint = (): Promise<boolean> => {
    if (!token) return Promise.resolve(false);
    return stopRequestedAfterYield(token);
  };
  if (await stopPoint()) return { cancelled: true };

  // The three phases named separately because they cost unrelated things:
  // resolving searches the document, the snapshot is where the per-id reads and
  // both probes are paid, and the checks themselves are pure.
  const { subject, origin } = await timer.phase("resolve", () =>
    resolveTarget(params),
  );
  if (await stopPoint()) return { cancelled: true, targetName: subject.name };

  const snapshot = await timer.phase("snapshot", () =>
    prepareSnapshot(subject, params.checks),
  );
  if (await stopPoint()) return { cancelled: true, targetName: subject.name };

  const outcome = await timer.phase("checks", () =>
    runChecks(snapshot, params.checks as CheckId[] | undefined),
  );
  const target = { id: subject.id, name: subject.name };
  // Record the instance the run started from, if any (for canvas placement).
  const generatedFor =
    origin?.type === "INSTANCE" ? { instanceId: origin.id } : undefined;

  const result: QaRunResult = {
    target,
    results: outcome.results,
    notImplemented: outcome.notImplemented,
    checklist: buildChecklistReport({
      target,
      results: outcome.results,
      notImplemented: outcome.notImplemented,
      generatedFor,
    }),
  };
  return {
    subject,
    origin,
    result,
    snapshot,
    theme: snapshot.theme,
    // Computed here, where the snapshot is, using the same helper the themes
    // check uses - a style-only set has no theme axis of its own to show.
    bindsOwnThemeVariables: bindsOwnThemeVariables(snapshot, snapshot.theme),
  };
}

registerOperation<QaRunParams, QaRunResult>(
  {
    id: "tidy_qa_run",
    kind: "query",
    module: "qa",
    summary:
      "Run the DS Component QA checklist against a component set. Target by nodeId or name/glob, or omit both to use the current selection. Returns CheckResults plus a 19-item checklist model. Read-only toward the target: it never modifies the component set. Three documented carve-outs from ADR-0001's read-only Query definition, all transient and all removed before the call returns: the themes (#17) and high-contrast (#16) checks create and remove one temporary off-canvas probe frame to resolve variables per theme mode; the responsiveness check (#7) instances the default variant into a temporary off-canvas frame, drives its width and lengthens its text to measure what breaks, then removes it; and `includeModeImages` builds, exports and removes the per-mode showcase it returns.",
    paramsExample: { name: "Button" },
  },
  async (params) =>
    timedRun("tidy_qa_run", async (timer) => {
      const run = await runQa(params, timer);
      // Unreachable as written: no token was passed, so runQa cannot stop.
      // Kept total rather than asserted away.
      if ("cancelled" in run) {
        throw new OperationError(
          ErrorCode.INTERNAL,
          "QA run stopped although no cancellation token was given",
        );
      }
      const { result } = run;
      if (params.includeModeImages) {
        const { image, skipped } = await timer.phase("mode-image", () =>
          renderModeImage(run),
        );
        if (image) result.modeImage = image;
        // Why there is no picture, rather than silently returning none: "this set
        // has no theme axis" is a fact about the component and worth saying.
        if (skipped) result.modeImageSkipped = skipped;
      }
      return result;
    }),
);

type BuildChecklistResult =
  | { cancelled: true; message: string; target?: { id: string; name: string } }
  | {
      cancelled?: false;
      frameId: string;
      target: { id: string; name: string };
      counts: QaRunResult["checklist"]["counts"];
      modeShowcaseId?: string;
      resizeEvidenceId?: string;
      contactSheetId?: string;
      sampleCount: number;
      image?: string;
    };

// No `name`/glob field: per CONTEXT.md, Execute Operations take explicit ids
// (selection is the only fallback) — lookup-by-name belongs to a Query
// Operation (tidy_qa_run), not embedded here.
interface BuildChecklistParams {
  /** Figma node id of the target (instance / component / component set). Omit to use the current selection. */
  nodeId?: string;
  /** Optional filter; defaults to all catalogue checks. */
  checks?: string[];
  /**
   * Optional: place the checklist next to this node instead of the resolved
   * target/origin — lets the designer keep the frame by the instance even
   * though checks ran against the owning set.
   */
  anchorNodeId?: string;
  /**
   * Return the drawn checklist as an image as well as an id (#146).
   *
   * The frame is the primary artifact this operation produces, and until this
   * existed it was the one thing an agent could not look at - the per-mode
   * showcase beside it was exportable while the checklist was not. Three visual
   * defects in this module passed a full test suite and were only caught by
   * rendering, so a change to the checklist's appearance had no way to be
   * checked except by asking a human.
   *
   * Off by default: it costs a render, and a run that only wants the counts
   * should not pay for one.
   */
  includeImage?: boolean;
  /**
   * Draw the property-combination contact sheet beside the checklist (#112): one row
   * per variant, one column per boolean combination, capped at 48 instances.
   *
   * Off by default, unlike the resize evidence beside it. The evidence block only
   * exists when something is actually broken, so it costs nothing on a healthy
   * component; the contact sheet is dozens of instances every time, and it carries no
   * verdict - it is there to remove the worst part of manual QA on row 3, which is
   * clicking through every combination one at a time. That is worth asking for
   * explicitly.
   */
  includeContactSheet?: boolean;
}

function isSceneNode(node: BaseNode): node is SceneNode {
  return "absoluteBoundingBox" in node;
}

/**
 * The node the checklist is drawn beside: the named anchor when there is one,
 * otherwise wherever the run started - falling back to the set itself on the
 * name/glob path, which points at nothing placed.
 */
async function resolveAnchor(
  anchorNodeId: string | undefined,
  origin: SceneNode | null,
  subject: QaSubject,
): Promise<SceneNode> {
  // Truthiness, not `!== undefined`, because that is what this has always done:
  // an empty anchorNodeId falls back to the origin rather than failing a lookup
  // it was never going to satisfy. `anchorRequested` is decided separately, and
  // does use `!== undefined`.
  if (!anchorNodeId) return origin ?? subject;

  const anchorNode = await figma.getNodeByIdAsync(anchorNodeId);
  if (!anchorNode || !isSceneNode(anchorNode)) {
    throw new OperationError(
      ErrorCode.NOT_FOUND,
      `anchor node ${anchorNodeId} not found`,
      true,
      { anchorNodeId },
    );
  }
  return anchorNode;
}

registerOperation<BuildChecklistParams, BuildChecklistResult>(
  {
    id: "tidy_qa_build_checklist",
    kind: "execute",
    module: "qa",
    summary:
      "Run the DS Component QA checklist and render it as a frame on the canvas next to the target (intended: a placed instance; resolves up to the owning set). Draws all 19 checklist items - automated ones with grouped findings, manual ones on a tinted row with no status chip. A finding from a check whose defects are visible also gets a live instance of one offending variant drawn beneath it, captioned with the variant and how many share the defect. Idempotent per target: re-running replaces the prior checklist frame. Returns only a stub (frame id, target, sampleCount, and pass/warn/fail/manual/pending counts), never the full findings. Target by nodeId, or omit it to use the current selection (to target by name/glob, look it up first with tidy_qa_run and pass the resulting nodeId); optionally pass anchorNodeId to place the frame next to a different node (e.g. the instance) than the one checks ran against. Stoppable anywhere in its read half (resolve, snapshot, checks) and before drawing - a stop then leaves the canvas unchanged, prior checklist included. Once drawing begins the run is not interrupted: every prior block is removed only as its replacement is drawn, so a stop mid-draw could leave a target with neither, which is the one outcome the boundaries exist to prevent.",
    // The stop policy in one line (#185): stoppable before the first removal,
    // committed from there on. The composer takes no token, so a checkpoint
    // inside the drawing cannot exist to be missed.
    cancellable: true,
    paramsExample: {},
  },
  async (params, ctx) =>
    timedRun("tidy_qa_build_checklist", async (timer) => {
      const run = await runQa(params, timer, ctx.cancellation);
      if ("cancelled" in run) {
        // Stopped in the read half: nothing was drawn and nothing removed.
        const message = describeStoppedChecklistRun(run.targetName ?? null);
        figma.notify(message, { timeout: 10_000 });
        return { cancelled: true, message };
      }

      const anchor = await resolveAnchor(
        params.anchorNodeId,
        run.origin,
        run.subject,
      );

      // Last stop boundary before the first removal. Everything the run has
      // done so far is read-only; everything after this check writes.
      if (await stopRequestedAfterYield(ctx.cancellation)) {
        const message = describeStoppedChecklistRun(run.result.target.name);
        figma.notify(message, { timeout: 10_000 });
        return { cancelled: true, message, target: run.result.target };
      }

      // The composition times its own document traversal separately, because
      // that is the step #213 changed; everything else it does is drawing, and
      // splitting the drawing per block would mean threading the timer through
      // the sequence that exists to keep the drawing in one place. No token is
      // passed into the composition - once the first removal happens the run
      // is committed, which is what keeps a cancelled build from leaving a
      // target with its old blocks cleared and no new ones drawn (#185).
      const artifacts = await timer.phase("compose", () =>
        composeChecklistArtifacts(run, {
          anchor,
          anchorRequested: params.anchorNodeId !== undefined,
          includeContactSheet: params.includeContactSheet ?? false,
          includeImage: params.includeImage ?? false,
          timer,
        }),
      );

      return {
        ...artifacts,
        target: run.result.target,
        counts: run.result.checklist.counts,
      };
    }),
);
