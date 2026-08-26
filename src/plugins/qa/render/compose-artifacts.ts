/// <reference types="@figma/plugin-typings" />

/**
 * Composing the block of artifacts a QA run draws beside its target.
 *
 * A checklist build draws up to four things: the checklist itself, the per-mode
 * showcase (#121), the resize evidence (#111) and the property contact sheet
 * (#112). Which of them exist depends on the component, so this is not a fixed
 * layout - it is a sequence of build-place-or-skip steps that has to leave the
 * canvas tidy whichever way each one goes.
 *
 * This used to sit inside the Operation, unnamed, where nothing could reach it
 * without a live document. It is a module in its own right: the Operation's job
 * is to validate parameters and run the pipeline, and composing a canvas is
 * neither.
 *
 * The decisions this makes are not here - they are pure and tested next door in
 * `compose.ts`. What is left is the figma-touching half: building, placing, and
 * guaranteeing that a block which fails to land is removed rather than left
 * lying on whatever page it was built on.
 */

import {
  collectPriorArtifacts,
  type PriorArtifactIndex,
} from "./prior-artifacts";
import { CHECKLIST_DATA_KEY, renderChecklist } from "./renderChecklist";
import {
  SHOWCASE_DATA_KEY,
  buildModeShowcase,
  placeModeShowcase,
  removePriorShowcase,
} from "./renderModeShowcase";
import {
  CONTACT_SHEET_DATA_KEY,
  EVIDENCE_DATA_KEY,
  buildStateGrid,
  placeStateGrid,
  removePriorStateGrid,
  type StateGridSubject,
} from "./renderStateGrid";
import { planModeShowcase } from "./mode-showcase";
import { planResizeEvidence } from "./resize-evidence";
import { planContactSheet } from "./contact-sheet";
import { isPlan, type StateGridPlan } from "./state-grid";
import { exportPngDataUrl } from "./primitives";
import {
  BLOCK_GAP,
  boundCollectionIds,
  decideRelocate,
  stackTop,
  themesStatusOf,
} from "./compose";
import { planResizeProbe } from "../resize/plan";
import { chooseVariant } from "../resize-probe";
import type { ComponentSetSnapshot, ThemeSnapshot } from "../snapshot";
import type { QaSubject } from "../subject";
import type { QaRunResult } from "../types";

/**
 * A completed QA run, as the composer needs it.
 *
 * Declared here rather than where it is produced because it is this module's
 * input contract: the snapshot and theme are carried through so every block is
 * planned from the same data the checks judged, rather than re-collected and
 * risking a picture that describes a different reading than the row it sits
 * under.
 */
export interface QaRun {
  subject: QaSubject;
  origin: SceneNode | null;
  result: QaRunResult;
  snapshot: ComponentSetSnapshot;
  theme: ThemeSnapshot | undefined;
  bindsOwnThemeVariables: boolean;
}

/**
 * What the showcase needs from a completed run.
 *
 * It carries the subject rather than taking it alongside, so there is no way to
 * ask about one component's modes while holding another one's run.
 */
export type QaRunContext = Pick<
  QaRun,
  "subject" | "theme" | "bindsOwnThemeVariables" | "result"
>;

/**
 * The showcase this run would draw, or the reason there is none.
 *
 * One helper for both operations so they cannot disagree about when a block is
 * warranted: the canvas path and the agent path differ only in what they do with
 * the frame afterwards.
 */
async function showcaseFor(
  run: QaRunContext,
): Promise<{ frame: FrameNode } | { skipped: string }> {
  const plan = planModeShowcase({
    theme: run.theme,
    themesStatus: themesStatusOf(run.result.results),
    bindsOwnThemeVariables: run.bindsOwnThemeVariables,
  });
  if (!plan.show) return { skipped: plan.reason };

  const frame = await buildModeShowcase(
    plan,
    run.subject,
    plan.collectionId,
    boundCollectionIds(run.theme),
  );
  return frame
    ? { frame }
    : { skipped: "the set has no default variant to render" };
}

/**
 * Render the per-mode showcase, export it, and remove it again (#121 step 2).
 *
 * Transient, deliberately. `tidy_qa_run` is a Query, and the block it draws for
 * `tidy_qa_build_checklist` is canvas evidence a designer asked for; an agent
 * asking to *see* the modes has not asked to have its file drawn on. So this
 * leaves nothing behind, on the error path too - the same rule as the theme
 * probe, and ADR-0001 requires it of any transient node in a Query.
 *
 * Marked as a transient probe as well, so that if the sandbox is killed between
 * building and removing, the next run's sweep reclaims it (#131). `finally`
 * cannot cover being killed; the marker is what does.
 */
export async function renderModeImage(
  run: QaRunContext,
): Promise<{ image?: string; skipped?: string }> {
  const showcase = await showcaseFor(run);
  if ("skipped" in showcase) return { skipped: showcase.skipped };

  // The builder already claimed it as transient, so a kill anywhere between
  // creation and here leaves something the next run's sweep reclaims.
  const frame = showcase.frame;
  try {
    // One image of every mode side by side, not one per mode: it is what "see
    // the modes together" actually means, and it stays clear of the bridge's
    // per-response image cap.
    return { image: await exportPngDataUrl(frame) };
  } finally {
    frame.remove();
  }
}

/**
 * What a grid block needs to instance the component: the default variant, and how a
 * width has to be driven through it.
 *
 * The drive path is re-planned from the snapshot rather than carried on the probe
 * result, so the evidence block drives the width exactly the way the measurement
 * did - one source of that judgement, and it is the tested one (`planResizeProbe`).
 * Returns null when there is no variant to instance, or none the probe measured.
 */
function gridSubject(
  subject: QaSubject,
  snapshot: ComponentSetSnapshot,
): StateGridSubject | null {
  const chosen = chooseVariant(subject, snapshot);
  if (!chosen) return null;
  const planned = planResizeProbe(chosen.variant.tree);
  return {
    main: chosen.component,
    // A component the probe declined to resize (a hugging one) can still be
    // instanced for a contact sheet; it simply never has a width driven through it,
    // and "direct" is the inert choice there.
    path: "plan" in planned ? planned.plan.path : "direct",
  };
}

/**
 * Draw one grid block beside the checklist, replacing any prior copy.
 *
 * The prior copy is cleared **unconditionally**, before deciding whether to draw a
 * new one. A component that has since been fixed produces no evidence this run, and
 * last run's broken-state pictures must not be left sitting beside a freshly rebuilt
 * checklist, where they read as current.
 */
async function drawGridBlock(
  dataKey: string,
  plan: StateGridPlan | { reason: string },
  subject: StateGridSubject | null,
  anchor: SceneNode,
  targetId: string,
  offsetY: number,
  /** The run's single document pass (#179), shared by every block. */
  priorArtifacts: PriorArtifactIndex<FrameNode>,
): Promise<FrameNode | undefined> {
  removePriorStateGrid(priorArtifacts, dataKey);
  if (!isPlan(plan) || !subject) return undefined;

  const block = await buildStateGrid(plan, subject);
  try {
    placeStateGrid(block, anchor, dataKey, targetId, offsetY);
  } catch (error) {
    // Stamping, reparenting or positioning failing would leave a finished block on
    // whatever page it was built on - exactly the litter ADR-0001 rules out. It
    // survives only on the path where it is wanted.
    block.remove();
    throw error;
  }
  return block;
}

/** What the caller asked for, beyond the run itself. */
export interface ComposeRequest {
  /** The node the checklist is drawn beside, already resolved. */
  anchor: SceneNode;
  /** Whether the caller named an `anchorNodeId`, which is a request to move. */
  anchorRequested: boolean;
  includeContactSheet: boolean;
  includeImage: boolean;
}

export interface ComposedArtifacts {
  frameId: string;
  modeShowcaseId?: string;
  resizeEvidenceId?: string;
  contactSheetId?: string;
  sampleCount: number;
  image?: string;
}

/**
 * Draw the checklist and every block that belongs beside it, and report what was
 * drawn.
 *
 * Ordering is load-bearing throughout: the prior-artifact index is collected
 * before anything is drawn so it describes the file as the run found it; each
 * block clears its own prior copy whether or not it draws a new one; and the
 * image is exported last so the picture is of the finished artifact rather than
 * of a frame still being assembled.
 */
export async function composeChecklistArtifacts(
  run: QaRun,
  request: ComposeRequest,
): Promise<ComposedArtifacts> {
  const { subject, origin, result } = run;
  const targetId = result.target.id;

  const relocate = decideRelocate({
    anchorRequested: request.anchorRequested,
    originId: origin?.id ?? null,
    targetId,
  });

  // One traversal for every block this rebuild may replace (#179). Collected
  // before anything is drawn, so it describes the file as the run found it,
  // and shared by the checklist lookup and all three removals below - which
  // used to be four separate walks of the whole document, three of them
  // unindexed, all before any useful work began.
  const priorArtifacts = await collectPriorArtifacts(targetId, [
    CHECKLIST_DATA_KEY,
    SHOWCASE_DATA_KEY,
    EVIDENCE_DATA_KEY,
    CONTACT_SHEET_DATA_KEY,
  ]);

  const { frame, sampleCount } = await renderChecklist(
    result.checklist,
    run.snapshot,
    request.anchor,
    priorArtifacts,
    relocate,
  );

  // The per-mode block, beside the checklist (#121 step 1). Costs no tokens and
  // no agent: it just puts every mode on one canvas, which nothing in a Figma
  // file otherwise does, so the row-17 tick becomes a glance instead of
  // switching modes and remembering what the other one looked like.
  //
  // Cleared unconditionally first. A re-run that now has nothing to show - a
  // filtered `checks` run that resolves no theme, a collection that lost a mode
  // - must not leave the last run's block sitting beside a freshly rebuilt
  // checklist, where it reads as current evidence.
  removePriorShowcase(priorArtifacts);

  // Unlike the theme probe's frame this one deliberately survives: canvas
  // evidence is the whole point. That is why it is labelled and stamped, and
  // why it is *not* marked as a transient probe - the sweep would take it.
  const showcase = await showcaseFor(run);
  let modeShowcaseId: string | undefined;
  if ("frame" in showcase) {
    try {
      placeModeShowcase(showcase.frame, frame, targetId);
    } catch (error) {
      // Stamping, reparenting or positioning failing would leave a finished
      // block on whatever page it was built on, which is exactly the litter the
      // issue rules out: it survives only on the path where it is wanted.
      showcase.frame.remove();
      throw error;
    }
    modeShowcaseId = showcase.frame.id;
  }

  // The blocks beside the checklist stack downward, each below whatever was
  // placed above it. A block that was not drawn never joins the list, so it
  // takes no share of the stack - `stackTop` owns that rule.
  const placed: number[] = [];
  if (modeShowcaseId && "frame" in showcase) placed.push(showcase.frame.height);

  const grid = gridSubject(subject, run.snapshot);

  // #111's evidence: automatic, because it only exists when a measurement found
  // something, and a finding a designer cannot see is the thing the block was
  // asked for.
  const evidence = await drawGridBlock(
    EVIDENCE_DATA_KEY,
    planResizeEvidence(run.snapshot.resizeProbe, run.snapshot),
    grid,
    frame,
    targetId,
    stackTop(placed, BLOCK_GAP),
    priorArtifacts,
  );
  if (evidence) placed.push(evidence.height);

  // #112's contact sheet: opt-in, because it is dozens of instances every time and
  // carries no verdict.
  const contactSheet = await drawGridBlock(
    CONTACT_SHEET_DATA_KEY,
    request.includeContactSheet
      ? planContactSheet(run.snapshot)
      : { reason: "not requested" },
    grid,
    frame,
    targetId,
    stackTop(placed, BLOCK_GAP),
    priorArtifacts,
  );

  // Exported after everything is placed, so the picture is of the finished
  // artifact rather than of a frame still being assembled.
  const image = request.includeImage
    ? await exportPngDataUrl(frame)
    : undefined;

  return {
    frameId: frame.id,
    sampleCount,
    ...(modeShowcaseId ? { modeShowcaseId } : {}),
    ...(evidence ? { resizeEvidenceId: evidence.id } : {}),
    ...(contactSheet ? { contactSheetId: contactSheet.id } : {}),
    ...(image ? { image } : {}),
  };
}
