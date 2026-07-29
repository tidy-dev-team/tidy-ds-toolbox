// Operation handlers for the QA engine (issue #76). Registered into the
// global Operation registry at module load via
// src/shared/operations/register-all.ts.
//
// Single agent-facing surface: `tidy_qa_run`. Returns structured CheckResults
// plus a 19-item ChecklistReport (PRD catalogue merge). The checks never touch
// the component set; the one document write in a run is the per-mode resolution
// probe's temporary frame (see theme-probe.ts and the ADR-0001 carve-out).

import { ErrorCode, OperationError } from "../../shared/operations/errors";
import { globToRegex } from "../../shared/operations/glob";
import { registerOperation } from "../../shared/operations/registry";
import { prepareSnapshot } from "./collector";
import { runChecks, unknownCheckIds } from "./checks";
import { buildChecklistReport } from "./report";
import { renderChecklist } from "./render/renderChecklist";
import type { ThemeSnapshot } from "./snapshot";
import type { CheckId, QaRunResult } from "./types";
import { planModeShowcase } from "./render/mode-showcase";
import {
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
  // Held in a local so `plan.show` narrows it too. The plan cannot say `show`
  // without a theme, but only the compiler seeing the same binding makes that a
  // guarantee rather than an assertion.
  const theme = run.theme;
  const plan = planModeShowcase({
    theme,
    themesStatus: run.result.results.find((r) => r.checkId === "themes")
      ?.status,
    bindsOwnThemeVariables: run.bindsOwnThemeVariables,
  });
  if (!plan.show) return { skipped: plan.reason };
  // Unreachable given the plan above, and kept so the compiler sees the narrowing
  // rather than being told to trust it.
  if (!theme) return { skipped: "no theme was resolved for this run" };

  const frame = await buildModeShowcase(
    plan,
    subject,
    plan.collectionId,
    theme,
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
      "Run the DS Component QA checklist against a component set. Target by nodeId or name/glob, or omit both to use the current selection. Returns CheckResults plus a 19-item checklist model. Read-only toward the target: it never modifies the component set. Two documented carve-outs from ADR-0001's read-only Query definition, both transient and both removed before the call returns: the themes (#17) and high-contrast (#16) checks create and remove one temporary off-canvas probe frame to resolve variables per theme mode, and `includeModeImages` builds, exports and removes the per-mode showcase it returns.",
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
      "Run the DS Component QA checklist and render it as a frame on the canvas next to the target (intended: a placed instance; resolves up to the owning set). Draws all 19 checklist items — automated ones with grouped findings, manual ones as empty checkboxes. Idempotent per target: re-running replaces the prior checklist frame. Returns only a stub (frame id, target, and pass/warn/fail/manual/pending counts), never the full findings. Target by nodeId, or omit it to use the current selection (to target by name/glob, look it up first with tidy_qa_run and pass the resulting nodeId); optionally pass anchorNodeId to place the frame next to a different node (e.g. the instance) than the one checks ran against.",
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
    const frame = await renderChecklist(result.checklist, anchor, relocate);

    // The per-mode block, beside the checklist (#121 step 1). Costs no tokens and
    // no agent: it just puts every mode on one canvas, which nothing in a Figma
    // file otherwise does, so the row-17 tick becomes a glance instead of
    // switching modes and remembering what the other one looked like.
    //
    // Cleared unconditionally first. A re-run that now has nothing to show - a
    // filtered `checks` run that resolves no theme, a collection that lost a mode
    // - must not leave the last run's block sitting beside a freshly rebuilt
    // checklist, where it reads as current evidence.
    await removePriorShowcase(result.target.id);

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

    return {
      frameId: frame.id,
      target: result.target,
      counts: result.checklist.counts,
      ...(modeShowcaseId ? { modeShowcaseId } : {}),
    };
  },
);
