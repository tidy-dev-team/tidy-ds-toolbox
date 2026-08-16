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

import { ErrorCode, OperationError } from "../../shared/operations/errors";
import { globToRegex } from "../../shared/operations/glob";
import { registerOperation } from "../../shared/operations/registry";
import { prepareSnapshot } from "./collector";
import { runChecks, unknownCheckIds } from "./checks";
import { buildChecklistReport } from "./report";
import { CHECKLIST_DATA_KEY, renderChecklist } from "./render/renderChecklist";
import {
  collectPriorArtifacts,
  type PriorArtifactIndex,
} from "./render/prior-artifacts";
import type { ComponentSetSnapshot, ThemeSnapshot } from "./snapshot";
import { planResizeProbe } from "./resize/plan";
import { chooseVariant } from "./resize-probe";
import { planResizeEvidence } from "./render/resize-evidence";
import { planContactSheet } from "./render/contact-sheet";
import { isPlan, type StateGridPlan } from "./render/state-grid";
import {
  buildStateGrid,
  placeStateGrid,
  removePriorStateGrid,
  type StateGridSubject,
} from "./render/renderStateGrid";
import type { CheckId, QaRunResult } from "./types";
import { planModeShowcase } from "./render/mode-showcase";
import {
  SHOWCASE_DATA_KEY,
  buildModeShowcase,
  placeModeShowcase,
  removePriorShowcase,
} from "./render/renderModeShowcase";
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

type QaSubject = ComponentSetNode | ComponentNode;

/** Resolve any pointed-at node up to the owning component set (or standalone component). */
async function resolveUp(node: BaseNode): Promise<QaSubject | null> {
  switch (node.type) {
    case "COMPONENT_SET":
      return node;
    case "COMPONENT":
      return node.parent?.type === "COMPONENT_SET" ? node.parent : node;
    case "INSTANCE": {
      const main = await node.getMainComponentAsync();
      return main ? resolveUp(main) : null;
    }
    default:
      return null;
  }
}

/** Resolve a concrete node up to its owning set, or throw WRONG_NODE_TYPE. */
async function subjectFromNode(node: BaseNode): Promise<QaSubject> {
  const subject = await resolveUp(node);
  if (!subject) {
    throw new OperationError(
      ErrorCode.WRONG_NODE_TYPE,
      `node ${node.id} (${node.type}) does not resolve to a component set`,
      true,
      { nodeId: node.id, nodeType: node.type },
    );
  }
  return subject;
}

/**
 * The QA subject plus the node the run actually started from (`origin`) — an
 * instance/component/set for the nodeId and selection paths, or null for the
 * name/glob path. Carrying the origin here avoids a second node fetch just to
 * discover whether the run began at an instance.
 *
 * `origin` is typed as `SceneNode` (not `BaseNode`) because it is only ever
 * set from a node that `subjectFromNode` has already accepted — which only
 * succeeds for COMPONENT_SET / COMPONENT / INSTANCE, all SceneNode subtypes.
 */
interface ResolvedTarget {
  subject: QaSubject;
  origin: SceneNode | null;
}

async function resolveTarget(params: QaRunParams): Promise<ResolvedTarget> {
  if (params.nodeId) {
    const node = await figma.getNodeByIdAsync(params.nodeId);
    if (!node) {
      throw new OperationError(
        ErrorCode.NOT_FOUND,
        `node ${params.nodeId} not found`,
        true,
        { nodeId: params.nodeId },
      );
    }
    const subject = await subjectFromNode(node);
    return { subject, origin: node as SceneNode };
  }

  // no explicit target → fall back to the current selection
  if (!params.name) {
    const selection = figma.currentPage.selection;
    if (selection.length === 0) {
      throw new OperationError(
        ErrorCode.INVALID_PARAMS,
        "no target and nothing selected — select a component/component set/instance, or pass a nodeId or name",
      );
    }
    return {
      subject: await subjectFromNode(selection[0]),
      origin: selection[0],
    };
  }

  // name / glob path
  const pattern = globToRegex(params.name);
  await figma.loadAllPagesAsync();
  const candidates = figma.root.findAllWithCriteria({
    types: ["COMPONENT", "COMPONENT_SET"],
  });

  const subjects = new Map<string, QaSubject>();
  for (const candidate of candidates) {
    if (!pattern.test(candidate.name)) continue;
    const subject = await resolveUp(candidate);
    if (subject) subjects.set(subject.id, subject);
  }

  if (subjects.size === 0) {
    throw new OperationError(
      ErrorCode.NOT_FOUND,
      `no component or component set matches '${params.name}'`,
      true,
      { name: params.name },
    );
  }
  if (subjects.size > 1) {
    throw new OperationError(
      ErrorCode.INVALID_PARAMS,
      `'${params.name}' is ambiguous — ${subjects.size} component sets match; pass a nodeId or a narrower glob`,
      true,
      {
        candidates: Array.from(subjects.values(), (s) => ({
          id: s.id,
          name: s.name,
        })),
      },
    );
  }
  return {
    subject: subjects.values().next().value as QaSubject,
    origin: null,
  };
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
 */
async function runQa(params: QaRunParams): Promise<{
  subject: QaSubject;
  origin: SceneNode | null;
  result: QaRunResult;
  /**
   * The collected snapshot. Returned so the canvas op can plan its evidence blocks
   * from the same data the checks judged, rather than re-collecting and risking the
   * picture describing a different reading than the row.
   */
  snapshot: ComponentSetSnapshot;
  /** The resolved theme, when the run probed one - what #121's showcase needs. */
  theme: ThemeSnapshot | undefined;
  /** Whether the set binds theme variables itself, rather than via styles. */
  bindsOwnThemeVariables: boolean;
}> {
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

  const { subject, origin } = await resolveTarget(params);
  const snapshot = await prepareSnapshot(subject, params.checks);

  const outcome = runChecks(snapshot, params.checks as CheckId[] | undefined);
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

/** What the showcase decision needs from a completed run. */
interface QaRunContext {
  theme: ThemeSnapshot | undefined;
  bindsOwnThemeVariables: boolean;
  result: QaRunResult;
}

/**
 * The showcase this run would draw, or the reason there is none.
 *
 * One helper for both operations so they cannot disagree about when a block is
 * warranted: the canvas path and the agent path differ only in what they do with
 * the frame afterwards.
 */
async function showcaseFor(
  subject: QaSubject,
  run: QaRunContext,
): Promise<{ frame: FrameNode } | { skipped: string }> {
  const plan = planModeShowcase({
    theme: run.theme,
    themesStatus: run.result.results.find((r) => r.checkId === "themes")
      ?.status,
    bindsOwnThemeVariables: run.bindsOwnThemeVariables,
  });
  if (!plan.show) return { skipped: plan.reason };

  // Every collection the set binds, so the showcase can pin the one that actually
  // carries light/dark polarity as well as the theme collection itself.
  const boundCollectionIds = [
    ...new Set(
      Object.values(run.theme?.variables ?? {}).map((v) => v.collectionId),
    ),
  ];
  const frame = await buildModeShowcase(
    plan,
    subject,
    plan.collectionId,
    boundCollectionIds,
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
async function renderModeImage(
  subject: QaSubject,
  run: QaRunContext,
): Promise<{ image?: string; skipped?: string }> {
  const showcase = await showcaseFor(subject, run);
  if ("skipped" in showcase) return { skipped: showcase.skipped };

  // The builder already claimed it as transient, so a kill anywhere between
  // creation and here leaves something the next run's sweep reclaims.
  const frame = showcase.frame;
  try {
    // One image of every mode side by side, not one per mode: it is what "see
    // the modes together" actually means, and it stays clear of the bridge's
    // per-response image cap.
    const bytes = await frame.exportAsync({
      format: "PNG",
      constraint: { type: "SCALE", value: 2 },
    });
    return { image: `data:image/png;base64,${figma.base64Encode(bytes)}` };
  } finally {
    frame.remove();
  }
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
  async (params) => {
    const run = await runQa(params);
    const { subject, result } = run;
    if (params.includeModeImages) {
      const { image, skipped } = await renderModeImage(subject, run);
      if (image) result.modeImage = image;
      // Why there is no picture, rather than silently returning none: "this set
      // has no theme axis" is a fact about the component and worth saying.
      if (skipped) result.modeImageSkipped = skipped;
    }
    return result;
  },
);

/** Stamps, so a re-run replaces its own prior block instead of stacking copies. */
const EVIDENCE_DATA_KEY = "tidy:qa-resize-evidence";
const CONTACT_SHEET_DATA_KEY = "tidy:qa-contact-sheet";

/** Vertical breathing room between two stacked blocks beside the checklist. */
const BLOCK_GAP = 32;

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

interface BuildChecklistResult {
  frameId: string;
  target: { id: string; name: string };
  counts: QaRunResult["checklist"]["counts"];
  /**
   * The per-mode showcase frame drawn beside the checklist (#121), when the set
   * has a theme axis worth showing. Absent means there was nothing to show, not
   * that anything failed.
   */
  modeShowcaseId?: string;
  /**
   * The baseline beside the state that broke, when the resize probe measured an
   * anomaly (#111). Absent on a healthy component, which is the common case and
   * costs nothing.
   */
  resizeEvidenceId?: string;
  /**
   * The property-combination contact sheet, when `includeContactSheet` asked for it
   * and the component has combinations worth comparing (#112).
   */
  contactSheetId?: string;
  /**
   * How many offending variants were drawn as samples inside the checklist (#171).
   *
   * Only a count, deliberately: this operation returns a stub and never findings,
   * and a number is enough to confirm the pictures were drawn without reopening
   * what the stub exists to withhold. Zero is the ordinary case - it means no row
   * both failed and came from a check whose defects are visible.
   */
  sampleCount: number;
  /**
   * The checklist frame as a PNG data URL, when `includeImage` asked for it.
   * Lifted into a viewable image block by the bridge (#116), which recognises an
   * image by the payload being a data URL rather than by any field name.
   */
  image?: string;
}

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

registerOperation<BuildChecklistParams, BuildChecklistResult>(
  {
    id: "tidy_qa_build_checklist",
    kind: "execute",
    module: "qa",
    summary:
      "Run the DS Component QA checklist and render it as a frame on the canvas next to the target (intended: a placed instance; resolves up to the owning set). Draws all 19 checklist items - automated ones with grouped findings, manual ones on a tinted row with no status chip. A finding from a check whose defects are visible also gets a live instance of one offending variant drawn beneath it, captioned with the variant and how many share the defect. Idempotent per target: re-running replaces the prior checklist frame. Returns only a stub (frame id, target, sampleCount, and pass/warn/fail/manual/pending counts), never the full findings. Target by nodeId, or omit it to use the current selection (to target by name/glob, look it up first with tidy_qa_run and pass the resulting nodeId); optionally pass anchorNodeId to place the frame next to a different node (e.g. the instance) than the one checks ran against.",
    paramsExample: {},
  },
  async (params) => {
    const run = await runQa(params);
    const { subject, origin, result } = run;
    let anchor: SceneNode = origin ?? subject;
    if (params.anchorNodeId) {
      const anchorNode = await figma.getNodeByIdAsync(params.anchorNodeId);
      if (!anchorNode || !isSceneNode(anchorNode)) {
        throw new OperationError(
          ErrorCode.NOT_FOUND,
          `anchor node ${params.anchorNodeId} not found`,
          true,
          { anchorNodeId: params.anchorNodeId },
        );
      }
      anchor = anchorNode;
    }
    // Whether this call should *move* an existing checklist. Pointing at a
    // placed node — a selected instance, an explicit anchorNodeId — is a
    // deliberate "put it here". Targeting the component set itself (an agent
    // passing the set's id, or the set being selected) is not: it resolves to
    // the same node the checklist is keyed on, carries no placement intent,
    // and must not drag the designer's frame off the instance's page.
    const relocate =
      params.anchorNodeId !== undefined ||
      (origin !== null && origin.id !== result.target.id);
    // One traversal for every block this rebuild may replace (#179). Collected
    // before anything is drawn, so it describes the file as the run found it,
    // and shared by the checklist lookup and all three removals below - which
    // used to be four separate walks of the whole document, three of them
    // unindexed, all before any useful work began.
    const priorArtifacts = await collectPriorArtifacts(result.target.id, [
      CHECKLIST_DATA_KEY,
      SHOWCASE_DATA_KEY,
      EVIDENCE_DATA_KEY,
      CONTACT_SHEET_DATA_KEY,
    ]);

    const { frame, sampleCount } = await renderChecklist(
      result.checklist,
      run.snapshot,
      anchor,
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
    const showcase = await showcaseFor(subject, run);
    let modeShowcaseId: string | undefined;
    if ("frame" in showcase) {
      try {
        placeModeShowcase(showcase.frame, frame, result.target.id);
      } catch (error) {
        // Stamping, reparenting or positioning failing would leave a finished
        // block on whatever page it was built on, which is exactly the litter the
        // issue rules out: it survives only on the path where it is wanted.
        showcase.frame.remove();
        throw error;
      }
      modeShowcaseId = showcase.frame.id;
    }

    // The blocks beside the checklist stack downward, so each one starts below
    // whatever was placed above it. Tracked as a running offset rather than
    // computed per block, because whether any given block exists depends on the
    // component.
    let nextY =
      modeShowcaseId && "frame" in showcase
        ? showcase.frame.height + BLOCK_GAP
        : 0;

    const grid = gridSubject(subject, run.snapshot);

    // #111's evidence: automatic, because it only exists when a measurement found
    // something, and a finding a designer cannot see is the thing the block was
    // asked for.
    const evidence = await drawGridBlock(
      EVIDENCE_DATA_KEY,
      planResizeEvidence(run.snapshot.resizeProbe, run.snapshot),
      grid,
      frame,
      result.target.id,
      nextY,
      priorArtifacts,
    );
    if (evidence) nextY += evidence.height + BLOCK_GAP;

    // #112's contact sheet: opt-in, because it is dozens of instances every time and
    // carries no verdict.
    const contactSheet = await drawGridBlock(
      CONTACT_SHEET_DATA_KEY,
      params.includeContactSheet
        ? planContactSheet(run.snapshot)
        : { reason: "not requested" },
      grid,
      frame,
      result.target.id,
      nextY,
      priorArtifacts,
    );

    // Exported after everything is placed, so the picture is of the finished
    // artifact rather than of a frame still being assembled. 2x because the
    // finding lines are 10-11px: at 1x they are the size where a vision model
    // stops being able to read them, which would make the image decorative.
    const image = params.includeImage
      ? `data:image/png;base64,${figma.base64Encode(
          await frame.exportAsync({
            format: "PNG",
            constraint: { type: "SCALE", value: 2 },
          }),
        )}`
      : undefined;

    return {
      frameId: frame.id,
      target: result.target,
      counts: result.checklist.counts,
      sampleCount,
      ...(modeShowcaseId ? { modeShowcaseId } : {}),
      ...(evidence ? { resizeEvidenceId: evidence.id } : {}),
      ...(contactSheet ? { contactSheetId: contactSheet.id } : {}),
      ...(image ? { image } : {}),
    };
  },
);
