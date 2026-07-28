/**
 * #8 — Icons / illustrations / logos connected to Foundations (issue #101).
 *
 * This check ships the part that the plugin API can establish with certainty
 * and states the rest honestly, rather than guessing at library origin:
 *
 * - **There is no library attribution for components.** `libraryName` exists
 *   only for variable collections. An instance exposes its main component's
 *   `key` and `remote` flag — no file key, no library name. So "is this icon
 *   from the approved Foundations file?" is not answerable from the API alone.
 *   A publish key *is* stable and globally unique, so #122 added the missing
 *   half: a generated manifest of the keys Foundations publishes (see
 *   ../asset-manifest.ts) turns the question into a lookup.
 *
 * **With a manifest, three of the outcomes become positive claims** (#122). A
 * remote instance is looked up by its main component's key:
 *
 * - **found on a current page** → genuinely verified. This is the only `pass`
 *   in this check that rests on evidence rather than on absence of evidence,
 *   and it is why the unverifiable-origin caveat is dropped for those rows.
 * - **found on a deprecated page** → `fail`. The legacy-directory rejection
 *   design originally asked for, and a defect the check is now sure of: the
 *   asset resolves, it is simply the wrong copy.
 * - **absent from the manifest** → `warn`, naming the date the manifest was
 *   taken. An asset published after that date is legitimately absent, so
 *   failing it would break QA for every newly published icon until someone
 *   regenerated. The row asks the question instead of guessing the answer.
 *
 * Without a manifest (a fresh clone, or before anyone runs the generator) every
 * remote instance falls back to the pre-#122 behaviour below: `pass` carrying
 * the caveat. The check never treats a missing manifest as a defect.
 *
 * The remaining rules are *negative* detection — things that are definitely not
 * a library instance:
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
 * 3. A remote nested instance with no manifest to check it against → `pass`,
 *    with the unverifiable-origin caveat carried in `note` so the row doesn't
 *    read as a stronger guarantee than it is. No false `fail` on legitimate
 *    remote icons.
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

import type { AssetManifest } from "../asset-manifest";
import {
  ASSET_MANIFEST,
  isDeprecatedPage,
  isManifestGenerated,
} from "../asset-manifest";
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
  /**
   * The manifest page this asset was found on. Only set for the deprecated
   * bucket, where the message has to name the directory it is rejecting - a
   * "this is deprecated" finding that cannot say *where* it read that is not
   * actionable.
   */
  page?: string;
}

/** Accumulate an occurrence under `key`, remembering the first node seen. */
function tally(
  into: Map<string, Offender>,
  key: string,
  label: string,
  node: NodeSnapshot,
  page?: string,
): void {
  const existing = into.get(key);
  if (existing) {
    existing.count += 1;
  } else {
    into.set(key, {
      label,
      nodeId: node.id,
      nodeName: node.name,
      count: 1,
      ...(page === undefined ? {} : { page }),
    });
  }
}

interface Scan {
  /** Offending raw path layers, keyed by layer name. */
  rawPaths: Map<string, Offender>;
  /** Local main components, keyed by owning set (falling back to publish key). */
  localMains: Map<string, Offender>;
  /** Instances whose main component didn't resolve, keyed by layer name. */
  unresolved: Map<string, Offender>;
  /** Manifest hits on a deprecated page (#122), keyed like `localMains`. */
  deprecated: Map<string, Offender>;
  /** Remote instances absent from the manifest (#122), keyed like `localMains`. */
  unapproved: Map<string, Offender>;
  /** Remote instances the manifest confirmed on a current page (#122). */
  verifiedCount: number;
  /**
   * Remote instances trusted on the strength of being remote alone, because no
   * manifest was available to check them against. Counted separately from
   * `verifiedCount` because only these need the caveat.
   */
  unverifiedRemoteCount: number;
}

function emptyScan(): Scan {
  return {
    rawPaths: new Map(),
    localMains: new Map(),
    unresolved: new Map(),
    deprecated: new Map(),
    unapproved: new Map(),
    verifiedCount: 0,
    unverifiedRemoteCount: 0,
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
function scanOffenders(
  node: NodeSnapshot,
  scan: Scan,
  manifest: AssetManifest,
): void {
  if (node.type === "INSTANCE") {
    const main = node.mainComponent;
    if (!main) {
      // Provenance genuinely unknown — report it rather than silently treating
      // it as either local or remote.
      tally(scan.unresolved, node.name, node.name, node);
    } else if (main.remote) {
      // The lookup is on the *variant's* key, which is what the manifest
      // records and what the instance actually points at. Bucketing is by
      // owning set, matching `localMains`, so one offending set is one row
      // however many of its variants were used.
      const bucketKey = main.setId ?? main.key;
      const label = main.setName ?? main.name;
      const entry = manifest.components[main.key];
      if (!isManifestGenerated(manifest)) {
        scan.unverifiedRemoteCount += 1;
      } else if (!entry) {
        tally(scan.unapproved, bucketKey, label, node);
      } else if (isDeprecatedPage(entry.page)) {
        tally(scan.deprecated, bucketKey, label, node, entry.page);
      } else {
        scan.verifiedCount += 1;
      }
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

  for (const child of node.children) scanOffenders(child, scan, manifest);
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
  /**
   * Injectable so the manifest-dependent verdicts are fixture-testable without
   * a generated file on disk; production always uses the bundled one.
   */
  manifest: AssetManifest = ASSET_MANIFEST,
): CheckResult {
  const scan = emptyScan();
  let assetVariants = 0;
  for (const variant of snapshot.variants) {
    if (isAssetVariant(variant.tree)) {
      assetVariants += 1;
      continue;
    }
    scanOffenders(variant.tree, scan, manifest);
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

  // " (generated 2026-07-28)" or "" — a manifest without a date can still have
  // contents if it was hand-assembled, and a row that promises a date it does
  // not have reads worse than one that omits it.
  const manifestDate = manifest.generatedAt
    ? ` (generated ${manifest.generatedAt})`
    : "";

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

  // A defect the check is certain of (#122): the key resolved, and the manifest
  // says it resolves to the wrong copy. Severity matches raw geometry because
  // the fix is the same shape - swap in the current asset - and unlike a local
  // nested instance there is no legitimate reading of it.
  for (const offender of scan.deprecated.values()) {
    findings.push(
      finding(offender, {
        severity: "high",
        message: `Nested instance comes from "${offender.label}", published on the deprecated Foundations page "${offender.page}".`,
        expected: "an asset from a current Foundations directory",
        actual: `an asset from the deprecated page "${offender.page}"`,
        suggestedFix:
          "Swap in the current Foundations asset that replaces it. If this page is not actually deprecated, rename it or adjust the rule in asset-manifest.ts.",
      }),
    );
  }

  // Deliberately a warn, not a fail: an asset published after the manifest was
  // generated is legitimately absent, and the row cannot tell that apart from an
  // unapproved library. Naming the date is what makes it decidable.
  for (const offender of scan.unapproved.values()) {
    findings.push(
      finding(offender, {
        severity: "medium",
        message: `Nested instance comes from "${offender.label}", which is not in the approved Foundations manifest${manifestDate}.`,
        expected: "an asset published by the approved Foundations library",
        actual: "a published component that is not in the manifest",
        suggestedFix:
          "If it was published to Foundations after the manifest was generated, regenerate it (npm run manifest:assets). Otherwise swap in the Foundations asset.",
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
  // Raw geometry and a deprecated-page hit are the two defects the check is
  // sure of. A local nested instance, an unresolvable main component and a key
  // the manifest does not list are all "look at this" — they warn, so the row
  // asks for a decision rather than claiming one.
  const status: CheckStatus =
    scan.rawPaths.size > 0 || scan.deprecated.size > 0
      ? "fail"
      : scan.localMains.size > 0 ||
          scan.unresolved.size > 0 ||
          scan.unapproved.size > 0
        ? "warn"
        : scan.verifiedCount > 0 || scan.unverifiedRemoteCount > 0
          ? "pass"
          : "not_applicable";

  return {
    checkId: "asset-provenance",
    title: TITLE,
    status,
    findings,
    ...noteFor(scan, status, manifest, manifestDate),
  };
}

/**
 * The row's `note`, which says something different in each of three worlds.
 *
 * Kept out of the main body because the precedence matters and is easy to get
 * subtly wrong: the caveat only applies to instances trusted *without* a
 * manifest, so a run that verified everything must not carry it, and a run that
 * verified some things while another rule failed still must.
 */
function noteFor(
  scan: Scan,
  status: CheckStatus,
  manifest: AssetManifest,
  manifestDate: string,
): Pick<CheckResult, "note"> {
  // Instances trusted on the strength of being remote alone. Stated alongside
  // failures too, since those remaining instances still rest on partial
  // evidence.
  if (scan.unverifiedRemoteCount > 0) return { note: CAVEAT };

  // Everything remote here was looked up. The claim is real, so the caveat
  // would be false - but the manifest's age is now the thing that limits it,
  // and that belongs on the row for the same reason the caveat did.
  if (scan.verifiedCount > 0) {
    const source = manifest.source ? ` from "${manifest.source.fileName}"` : "";
    return {
      note: `Origin verified against the approved Foundations manifest${manifestDate}${source}: every remote instance here is published by that library and sits on a current page. An asset published after that date would show up as unapproved, so regenerate the manifest before treating such a row as a defect.`,
    };
  }

  // A different cause from the asset exemption earlier: nothing
  // provenance-bearing at all, rather than the set being the asset itself.
  if (status === "not_applicable") {
    return {
      note: "Nothing here carries provenance: no nested instances, and no raw artwork that reads as a detached asset rather than an ordinary shape.",
    };
  }

  return {};
}
