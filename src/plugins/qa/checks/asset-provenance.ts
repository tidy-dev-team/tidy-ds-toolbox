/**
 * #8 — Icons / illustrations / logos connected to Foundations (issue #101).
 *
 * This check ships the part that the plugin API can establish with certainty
 * and states the rest honestly, rather than guessing at library origin:
 *
 * - **There is no library attribution for components.** `libraryName` exists
 *   only for variable collections. An instance exposes its main component's
 *   `key` and `remote` flag — no file key, no library name. So "is this icon
 *   from the approved Foundations file?" is simply not answerable in-plugin,
 *   and an approved-key manifest is deferred to its own ticket (it needs a
 *   generation + refresh pipeline outside the plugin sandbox).
 *
 * The three rules are therefore *negative* detection — things that are
 * definitely not a library instance:
 *
 * 1. Raw path geometry alongside other content → `fail`, the only defect this
 *    check is certain of. Detached paths and copy-pasted art. Only true path
 *    types count (VECTOR, BOOLEAN_OPERATION, STAR, POLYGON); LINE, RECTANGLE
 *    and ELLIPSE are primitives designers legitimately draw as dividers,
 *    backgrounds and dots, so flagging those would bury the real signal.
 * 2. A nested instance whose main component is local (`remote === false`) →
 *    `warn`, not `fail`. This applies to *every* nested instance, not just
 *    icons, which is why this check needs no "is this an icon?" classifier —
 *    but that breadth is exactly why it can't assert a defect. A component
 *    legitimately built from private sub-components in its own file (Kido's
 *    `_elements / …` parts) is indistinguishable here from a stray local copy
 *    of an icon, so the check surfaces it and leaves the judgement to the
 *    designer instead of telling her to publish a deliberately private part.
 * 3. A remote nested instance → `pass`, with the unverifiable-origin caveat
 *    carried in `note` so the row doesn't read as a stronger guarantee than it
 *    is. No false `fail` on legitimate remote icons.
 *
 * An instance whose main component doesn't resolve at all is a fourth,
 * unavoidable case: it is neither certainly local nor certainly remote, so it
 * `warn`s instead of being silently sorted into one of the two.
 *
 * **The asset-component exemption.** When the thing under QA *is* the asset its
 * own geometry is legitimate, and rule 1 would otherwise fail every icon in
 * the library. The exemption is structural, not name-based: a variant whose
 * every leaf is geometry is the asset, and is skipped. Here the geometry set is
 * deliberately *wider* than rule 1's (primitives included), because an
 * illustration mixing paths with circles and rects is still nothing but
 * artwork. The Kido convention that an icon contains an element named `ic` is
 * compatible but unused: a frame named `ic` is a container, not a leaf, so a
 * vector-only icon exempts anyway — and when `ic` is an *instance* inside a
 * Button, rule 2 catches it on its own.
 *
 * The exemption is judged **per variant**, not pooled over the set: pooling
 * would let one stray non-geometry leaf in a single variant un-exempt the whole
 * icon set and then fail every vector in it — precisely the false positive the
 * exemption exists to prevent.
 *
 * Findings are one per offending main component (or per offending layer name,
 * for raw geometry — pasted artwork has no main component to key on) with an
 * occurrence count and one representative node, never one per usage site
 * (#100).
 */

import type { ComponentSetSnapshot, NodeSnapshot } from "../snapshot";
import type { CheckResult, CheckStatus, Finding } from "../types";

/**
 * Rule 1: node types that only exist as drawn/pasted path artwork.
 *
 * `LINE` is deliberately absent, for the same reason `RECTANGLE` and `ELLIPSE`
 * are: it is the primitive designers reach for to draw a divider or rule, so
 * flagging it would fail ordinary cards and menus at high severity and bury the
 * real signal. It still counts as geometry for the exemption below — a line
 * inside a logo is artwork.
 */
const RAW_PATH_TYPES: readonly string[] = [
  "VECTOR",
  "BOOLEAN_OPERATION",
  "STAR",
  "POLYGON",
];

/**
 * The exemption test: leaf types that are pure artwork. Wider than
 * RAW_PATH_TYPES — a logo built from circles and bars is still just artwork,
 * even though a lone rectangle inside a Button is not a provenance problem.
 */
const GEOMETRY_LEAF_TYPES: readonly string[] = [
  ...RAW_PATH_TYPES,
  "LINE",
  "RECTANGLE",
  "ELLIPSE",
];

/**
 * Containers that hold nothing. A childless frame — a clip frame, a spacer —
 * is not artwork, but it is not evidence *against* being an asset either, so
 * the exemption test ignores it. Counting it as a non-geometry leaf let one
 * invisible empty frame un-exempt an icon variant and then fail every vector
 * in it: the exact false positive the exemption exists to prevent.
 *
 * INSTANCE is pointedly not in this list. Instance interiors are never
 * collected, so a nested instance is always childless here, and it must keep
 * counting as a non-geometry leaf — that is what stops a component with an
 * icon *slot* from exempting itself.
 */
const EMPTY_CONTAINER_TYPES: readonly string[] = [
  "FRAME",
  "GROUP",
  "COMPONENT",
  "COMPONENT_SET",
  "SECTION",
];

const CAVEAT =
  "Library origin cannot be verified through the plugin API: Figma exposes a main component's key and remote flag but no file key or library name, so a remote nested instance is reported as passing on the strength of being remote alone. Confirm by eye that these come from Foundations.";

const TITLE = "Icons / illustrations / logos from Foundations";

interface Offender {
  /** What the finding names — a main component, or a raw layer name. */
  label: string;
  /** First occurrence — the representative node for "jump to offender". */
  nodeId: string;
  nodeName: string;
  count: number;
}

/** Accumulate an occurrence under `key`, remembering the first node seen. */
function tally(
  into: Map<string, Offender>,
  key: string,
  label: string,
  node: NodeSnapshot,
): void {
  const existing = into.get(key);
  if (existing) {
    existing.count += 1;
  } else {
    into.set(key, { label, nodeId: node.id, nodeName: node.name, count: 1 });
  }
}

interface Scan {
  /** Offending raw path layers, keyed by layer name. */
  rawPaths: Map<string, Offender>;
  /** Local main components, keyed by owning set (falling back to publish key). */
  localMains: Map<string, Offender>;
  /** Instances whose main component didn't resolve, keyed by layer name. */
  unresolved: Map<string, Offender>;
  remoteInstanceCount: number;
}

function emptyScan(): Scan {
  return {
    rawPaths: new Map(),
    localMains: new Map(),
    unresolved: new Map(),
    remoteInstanceCount: 0,
  };
}

/**
 * True when every leaf under `root` is pure geometry — i.e. this variant *is*
 * the asset. The variant root itself is never a leaf: a childless component
 * frame is empty, not artwork.
 */
function isAssetVariant(root: NodeSnapshot): boolean {
  let leaves = 0;
  let geometryLeaves = 0;

  function visit(node: NodeSnapshot, isRoot: boolean): void {
    // INSTANCE interiors are never collected (see the collector), so a nested
    // instance is always a leaf here — and a leaf that is not geometry, which
    // is what stops a set with an icon *slot* from exempting itself.
    if (
      node.children.length === 0 &&
      !isRoot &&
      !EMPTY_CONTAINER_TYPES.includes(node.type)
    ) {
      leaves += 1;
      if (GEOMETRY_LEAF_TYPES.includes(node.type)) geometryLeaves += 1;
    }
    for (const child of node.children) visit(child, false);
  }
  visit(root, true);

  return leaves > 0 && geometryLeaves === leaves;
}

/** Collect this variant's provenance offenders into the shared set-wide scan. */
function scanOffenders(node: NodeSnapshot, scan: Scan): void {
  if (node.type === "INSTANCE") {
    const main = node.mainComponent;
    if (!main) {
      // Provenance genuinely unknown — report it rather than silently treating
      // it as either local or remote.
      tally(scan.unresolved, node.name, node.name, node);
    } else if (main.remote) {
      scan.remoteInstanceCount += 1;
    } else {
      // Key and label on the owning *set*, not the variant. An instance's main
      // component is a variant, so `main.name` is `State=Default` — which names
      // nothing a designer recognises, and worse, is identical across unrelated
      // sets: five distinct offenders produced five byte-identical messages,
      // which `groupFindings` then collapsed into a single canvas row. Keying
      // on the set also stops one offending set being reported twice because
      // two of its variants were used.
      tally(
        scan.localMains,
        main.setId ?? main.key,
        main.setName ?? main.name,
        node,
      );
    }
  } else if (RAW_PATH_TYPES.includes(node.type)) {
    tally(scan.rawPaths, node.name, node.name, node);
  }

  for (const child of node.children) scanOffenders(child, scan);
}

function finding(
  offender: Offender,
  parts: Pick<Finding, "severity" | "message" | "expected" | "actual"> &
    Partial<Pick<Finding, "suggestedFix">>,
): Finding {
  return {
    ...parts,
    nodeId: offender.nodeId,
    nodeName: offender.nodeName,
    count: offender.count,
  };
}

export function checkAssetProvenance(
  snapshot: ComponentSetSnapshot,
): CheckResult {
  const scan = emptyScan();
  let assetVariants = 0;
  for (const variant of snapshot.variants) {
    if (isAssetVariant(variant.tree)) {
      assetVariants += 1;
      continue;
    }
    scanOffenders(variant.tree, scan);
  }

  // Every variant is the asset itself — nothing here is a nested library
  // instance, so there is nothing for this check to judge.
  if (assetVariants > 0 && assetVariants === snapshot.variants.length) {
    return {
      checkId: "asset-provenance",
      title: TITLE,
      status: "not_applicable",
      // The #101 structural exemption is the most interesting judgment this
      // check makes, and on an icon set it was the least explained (#129).
      note: "Every variant is the asset artwork itself rather than a layout containing assets, so there is no nested instance whose origin could be checked.",
      findings: [],
    };
  }

  const findings: Finding[] = [];

  for (const offender of scan.rawPaths.values()) {
    findings.push(
      finding(offender, {
        severity: "high",
        message: `Layer "${offender.label}" is raw vector geometry alongside other content, not a library instance.`,
        expected: "an instance of an icon/illustration/logo from Foundations",
        actual: "raw vector geometry",
        suggestedFix:
          "Replace the pasted/detached artwork with an instance of the Foundations asset.",
      }),
    );
  }

  // The message names the *main component*, not the offending layer: the count
  // aggregates every usage site, and those sites can carry different layer
  // names ("ic", "trailing"), so quoting one of them would under-describe the
  // count. `nodeId`/`nodeName` still point at one representative site.
  for (const offender of scan.localMains.values()) {
    findings.push(
      finding(offender, {
        severity: "medium",
        message: `Nested instance comes from "${offender.label}", a component in this file rather than a library.`,
        expected:
          "a library instance, unless this is deliberately a local part",
        actual: "a local component in this file",
        suggestedFix:
          "Fine if this is an internal building block. If it should come from Foundations, swap in the library instance.",
      }),
    );
  }

  for (const offender of scan.unresolved.values()) {
    findings.push(
      finding(offender, {
        severity: "medium",
        message: `Main component for nested instance "${offender.label}" could not be resolved — its provenance is unknown.`,
        expected: "a resolvable main component",
        actual: "unresolved main component",
      }),
    );
  }

  findings.sort((a, b) => a.message.localeCompare(b.message));

  // `not_applicable` when nothing provenance-bearing exists at all: no nested
  // instances, no raw geometry. Nothing was measured, which is a different
  // fact from "measured and it's fine" and must not inflate the pass count.
  // Only raw geometry is a defect the check is sure of. A local nested
  // instance and an unresolvable main component are both "look at this" — they
  // warn, so the row asks for a decision rather than claiming one.
  const status: CheckStatus =
    scan.rawPaths.size > 0
      ? "fail"
      : scan.localMains.size > 0 || scan.unresolved.size > 0
        ? "warn"
        : scan.remoteInstanceCount > 0
          ? "pass"
          : "not_applicable";

  return {
    checkId: "asset-provenance",
    title: TITLE,
    status,
    findings,
    // Stated whenever any remote instance was trusted on the strength of being
    // remote — including alongside failures, since the remaining instances
    // still rest on that partial evidence.
    //
    // The two are mutually exclusive: `not_applicable` here is reached only
    // when `remoteInstanceCount` is 0, so the caveat and the reason can never
    // both apply. This n/a is a different cause from the asset exemption
    // above - nothing provenance-bearing at all, rather than the set being
    // the asset - so it gets its own reason.
    ...(scan.remoteInstanceCount > 0
      ? { note: CAVEAT }
      : status === "not_applicable"
        ? {
            note: "Nothing here carries provenance: no nested instances, and no raw artwork that reads as a detached asset rather than an ordinary shape.",
          }
        : {}),
  };
}
