/**
 * #16 - High contrast (issue #103). Does every text layer clear WCAG AA against
 * the background it is actually drawn on, in every theme mode?
 *
 * **Never guess the background.** The pairing is the nearest ancestor with a
 * visible solid fill, composited outward until the stack is opaque. If nothing
 * opaque is reached by the variant root, the layer is *not evaluated* - no
 * assumed white, no assumed page colour. In a checklist a human still ticks
 * through, a false negative is cheap and a false positive is expensive:
 * inventing a background and failing the component against it is exactly the
 * error that makes designers stop reading the row.
 *
 * Sibling geometry is deliberately out of scope: a chip over a hero image
 * degrades to "not evaluated" rather than to a wrong answer, since deciding
 * what is behind a layer would need absolute bounds and a z-order model.
 *
 * **"Not evaluated" is reported, never quietly green.** Every skipped layer
 * lands in one low-severity tally finding, and any skip at all makes the row
 * `warn` rather than `pass` - without that the row would lie by omission.
 *
 * **Alpha is composited, not skipped.** The Kido DS uses opacity in place of
 * absolute hex, so blanket-skipping translucent fills would skip a large share
 * of real surface. Paint opacity and node opacity both count, and only a chain
 * that never reaches opacity is skipped. Node opacity is treated as what Figma
 * makes it - a *group* property, fading a frame's fill and its children as one
 * composite - see `render`, since applying it per layer instead invents
 * failures on any component that fades a whole surface.
 *
 * **How far a colour is chased:** literal hex, bound variable (per mode, from
 * #17's resolution table), paint style, and a paint style whose paint is
 * variable-bound. The `tokens` check accepts either a variable or a style, so
 * resolving variables only would leave most rows unevaluated for an
 * implementation-detail reason - and an unevaluated contrast check is worse
 * than none, because the row still looks checked.
 *
 * **Mixed-colour text is measured per run** (issue #124). A layer painted in one
 * colour is one measurement; a layer whose fills change mid-sentence - a
 * coloured link inside a paragraph, a highlighted word - is measured once per
 * styled run, each against the same background and at its own size and weight.
 * Treating that layer as one unit was never possible ("the first fill" would be
 * confidently wrong), and skipping it entirely made the one text that most often
 * carries a low-contrast link invisible to the check.
 *
 * **A run is not an occurrence.** Findings still count *layers*, so a paragraph
 * with four grey runs on white is one occurrence of that pair, not four - the
 * defect is one token pair, and inflating the count by how many times a designer
 * happened to split the run would make the number mean nothing. Runs that fail on
 * genuinely different pairs do report separately, because those are different
 * fixes. Where runs share a pair but not a threshold, the strictest one is
 * reported, the same rule already used across layers.
 *
 * A mixed *font size* alone is still judged at its smallest, so the strictest
 * applicable threshold wins: size does not change what colour is on screen, so
 * one verdict still describes the layer.
 *
 * **AA, dual threshold, no warn tier**: 4.5:1 normally, 3:1 for large text
 * (>= 24px, or >= 18.66px bold). AA is the standard, and a warn band for AAA
 * would be noise. Invisible text needs no special case - it arrives as the
 * ratio-1.0 extreme, which is why #17 leaves it here.
 *
 * **Disabled variants are not evaluated at all.** WCAG 1.4.3 exempts inactive
 * controls, so a faded disabled state is not a defect - and left in, those
 * failures dominate the row while being both unfixable and correct. A row full
 * of unfixable failures is one designers learn to skip.
 *
 * Findings are one per **colour pair x mode** with an occurrence count (#100),
 * naming tokens rather than hex wherever both sides are bound: the fix is one
 * token pair, and names are what a designer can act on. Distinct pairs are
 * never merged - a hover surface and a default surface fail for different
 * reasons, so keying on anything but the pair would hide one behind the other.
 *
 * Everything the row cannot speak for is in its `note`, including the
 * `not_applicable` case: a row with no findings and no note is a blank row, and
 * a reader cannot tell "found nothing to measure" from "broken" or "skipped".
 */

import type {
  ColorStyleSnapshot,
  ComponentSetSnapshot,
  NodeSnapshot,
  PaintSnapshot,
  TextSegmentSnapshot,
  ThemeSnapshot,
} from "../snapshot";
import type { CheckResult, CheckStatus, Finding } from "../types";
import { AA_NORMAL, contrastRatio, layer, requiredRatio } from "../contrast";
import type { Rgba } from "../contrast";
import { unreadableVariants } from "../variant-properties";

const TITLE = "High contrast (WCAG AA)";

/** Alpha at or above which a stack counts as opaque - rounding slack only. */
const OPAQUE = 0.999;

/**
 * Why a text layer was not evaluated. One reason per layer, in this
 * precedence order, so the tally's per-reason counts always sum to the total.
 */
type SkipReason =
  | "mixed-fill"
  | "no-fill"
  | "non-solid"
  | "unresolved-colour"
  | "no-background";

const SKIP_PHRASES: Record<SkipReason, { one: string; many: string }> = {
  // Reached only when the per-run fills could not be read at all (#124 measures
  // them when they can). A layer that says "my fills are mixed" and offers no
  // runs describes nothing measurable, and saying so is better than assuming.
  "mixed-fill": {
    one: "uses per-character fills",
    many: "use per-character fills",
  },
  "no-fill": {
    one: "has no solid fill to measure",
    many: "have no solid fill to measure",
  },
  "non-solid": {
    one: "has a gradient or image in its colour chain",
    many: "have a gradient or image in their colour chain",
  },
  "unresolved-colour": {
    one: "has a colour that does not resolve in every mode",
    many: "have colours that do not resolve in every mode",
  },
  "no-background": {
    one: "had no opaque background behind it",
    many: "had no opaque background behind them",
  },
};

const SKIP_PRECEDENCE: readonly SkipReason[] = [
  "mixed-fill",
  "no-fill",
  "non-solid",
  "unresolved-colour",
  "no-background",
];

interface Mode {
  modeId: string;
  name: string;
}

/** A visible text layer with the ancestor chain that could back it. */
interface Candidate {
  node: NodeSnapshot;
  /** Ancestors nearest-first, up to the variant root. */
  ancestors: NodeSnapshot[];
}

/**
 * One measurable unit of text: a whole layer, or one styled run inside a layer
 * whose fills change mid-sentence (#124). Everything downstream of the colour
 * lookup is identical for both, which is why they share a shape - the run and
 * the layer sit at the same place in the same ancestor chain, so only the
 * foreground colour and the AA threshold differ.
 */
interface Piece {
  paints: PaintSnapshot[] | undefined;
  style?: ColorStyleSnapshot;
  fontSize?: number;
  bold: boolean;
}

/**
 * A colour resolved for one node in one mode. `undefined` means "this node
 * paints nothing" (a transparent ancestor, which the walk passes straight
 * through). The two failures are kept apart because they are different defects
 * to report: `"non-solid"` is a gradient or image, which has no single colour
 * to measure, while `"unresolved"` is a variable or style that would not
 * resolve.
 */
type Resolved =
  | { rgba: Rgba; label: string }
  | "unresolved"
  | "non-solid"
  | undefined;

/**
 * The two rendered pixels a contrast ratio is measured between: one where the
 * glyph is, one on the surface beside it. Both are folded through the same
 * ancestor chain, so whatever an enclosing group does to one it does to the
 * other.
 */
interface Rendered {
  text: Rgba;
  background: Rgba;
  /** Display name of the nearest ancestor fill that contributed. */
  label: string;
}

/** Colour pair failing in one mode, with every layer that hits it. */
interface Failure {
  modeName: string;
  foreground: string;
  background: string;
  ratio: number;
  required: number;
  large: boolean;
  nodeId: string;
  nodeName: string;
  count: number;
}

export function checkHighContrast(snapshot: ComponentSetSnapshot): CheckResult {
  const active = snapshot.variants.filter((v) => !isDisabledVariant(v));
  const disabledCount = snapshot.variants.length - active.length;

  const candidates: Candidate[] = [];
  for (const variant of active) {
    collectCandidates(variant.tree, [], candidates);
  }

  if (candidates.length === 0) {
    // A `not_applicable` row renders with no findings, so without a note it is
    // a blank row: the reader cannot tell a check that found nothing to measure
    // from one that is broken or was skipped.
    return {
      checkId: "high-contrast",
      title: TITLE,
      status: "not_applicable",
      findings: [],
      note: nothingToMeasureNote(snapshot, disabledCount),
    };
  }

  const modes = evaluatedModes(snapshot.theme);
  const failures = new Map<string, Failure>();
  const skipped = new Map<string, SkipReason[]>();

  const skip = (node: NodeSnapshot, reason: SkipReason) => {
    const reasons = skipped.get(node.id);
    if (reasons) reasons.push(reason);
    else skipped.set(node.id, [reason]);
  };

  for (const candidate of candidates) {
    const { node } = candidate;
    // A layer that declares mixed fills and carries no runs describes nothing
    // measurable. Mode-independent, so it is settled before any mode is
    // considered - and settled once, not once per mode.
    const pieces = textPieces(node, snapshot);
    if (pieces === undefined) {
      skip(node, "mixed-fill");
      continue;
    }

    // Which failure keys this *layer* has already been counted against, so a
    // paragraph whose runs share a colour pair counts once. The count means
    // "how many layers hit this pair", and a run is not a layer.
    const counted = new Set<string>();

    for (const piece of pieces) {
      for (const mode of modes) {
        const own = resolvePaints(piece.paints, piece.style, mode, snapshot);
        if (own === undefined) {
          skip(node, "no-fill");
          break;
        }
        if (own === "non-solid" || own === "unresolved") {
          skip(node, own === "non-solid" ? "non-solid" : "unresolved-colour");
          continue;
        }

        // The text layer's own opacity, applied here for the same reason
        // `resolveColor` leaves it out: it is a group property, and the text is
        // its own (leaf) group. It fades every run alike.
        const selfOpacity = node.opacity ?? 1;
        const start: Rgba =
          selfOpacity === 1
            ? own.rgba
            : { hex: own.rgba.hex, alpha: own.rgba.alpha * selfOpacity };

        const rendered = render(candidate, start, mode, snapshot);
        if (rendered === "non-solid" || rendered === "unresolved") {
          skip(
            node,
            rendered === "non-solid" ? "non-solid" : "unresolved-colour",
          );
          continue;
        }
        if (rendered === undefined) {
          skip(node, "no-background");
          continue;
        }

        const ratio = contrastRatio(rendered.text.hex, rendered.background.hex);
        const required = requiredRatio(piece.fontSize, piece.bold);
        if (ratio >= required) continue;

        // Keyed on the **rendered** colours, not on the token names: two layers
        // can quote the same token pair and still render differently (a 50%
        // opacity on one of them), and merging those would report one ratio for
        // two different pairs. Names are kept for display only.
        const key = JSON.stringify([
          mode.modeId,
          rendered.text.hex,
          rendered.background.hex,
        ]);
        const existing = failures.get(key);
        if (existing) {
          if (!counted.has(key)) existing.count += 1;
          // One rendered pair is one row, so a group holding both normal and
          // large text is described by its strictest member - the count covers
          // the rest. Splitting on the threshold instead would put the same
          // colour pair on two rows, which the ticket rules out. The same rule
          // settles two runs of one layer that share a pair at different sizes.
          if (required > existing.required) {
            existing.required = required;
            existing.large = false;
          }
        } else {
          failures.set(key, {
            modeName: mode.name,
            foreground: own.label,
            background: rendered.label,
            ratio,
            required,
            large: required < AA_NORMAL,
            nodeId: node.id,
            nodeName: node.name,
            count: 1,
          });
        }
        counted.add(key);
      }
    }
  }

  const findings = [...failures.values()]
    .map(failureFinding)
    .sort((a, b) => a.message.localeCompare(b.message));

  const tally = skipTally(skipped, candidates);
  if (tally) findings.push(tally);

  const status: CheckStatus =
    failures.size > 0 ? "fail" : skipped.size > 0 ? "warn" : "pass";

  return {
    checkId: "high-contrast",
    title: TITLE,
    status,
    findings,
    note: buildNote(
      snapshot.theme,
      modes,
      disabledCount,
      unreadableVariants(snapshot).length,
    ),
  };
}

/**
 * Visible text layers, each carrying its ancestor chain nearest-first. Hidden
 * layers and hidden subtrees are not rendered, so they are not candidates at
 * all - not even skipped ones.
 *
 * Nested instance interiors never appear here: the snapshot stops at instance
 * boundaries by design (#8 owns what is inside them), so text inside a nested
 * component is that component's own QA subject.
 */
function collectCandidates(
  node: NodeSnapshot,
  ancestors: NodeSnapshot[],
  out: Candidate[],
): void {
  if (!node.visible) return;
  if (node.type === "TEXT") {
    out.push({ node, ancestors });
    return;
  }
  const chain = [node, ...ancestors];
  for (const child of node.children) {
    collectCandidates(child, chain, out);
  }
}

/**
 * The modes to evaluate. Falls back to a single anonymous mode when there is no
 * theme table, so a set painted in literal hex or styles is still checked -
 * bound variables simply cannot resolve there and are skipped.
 *
 * Unlike #17 this accepts a single-mode collection: one mode is a perfectly
 * good context to measure contrast in, even though it is not a theme.
 */
function evaluatedModes(theme: ThemeSnapshot | undefined): Mode[] {
  if (theme && theme.modes.length > 0) return theme.modes;
  return [{ modeId: "", name: "" }];
}

/**
 * The paints to measure, and the style name when they came from a style.
 *
 * A style the collector could not resolve falls back to the fills held on the
 * node or run itself, which Figma keeps in sync with the style: the name is
 * lost, the colour is not.
 */
function paintSource(
  fills: PaintSnapshot[] | undefined,
  fillStyleId: string | undefined,
  snapshot: ComponentSetSnapshot,
): { paints: PaintSnapshot[] | undefined; style?: ColorStyleSnapshot } {
  if (fillStyleId && fillStyleId !== "MIXED") {
    const style = snapshot.colorStyles?.[fillStyleId];
    if (style) return { paints: style.paints, style };
  }
  return { paints: fills };
}

/**
 * The units to measure a text layer in: one per styled run when its fills change
 * mid-sentence (#124), otherwise the single unit that is the whole layer.
 *
 * `undefined` means the layer says its fills are mixed but carries no runs -
 * nothing measurable, and the caller reports it as unevaluated rather than
 * picking a colour out of a layer that does not have one.
 */
function textPieces(
  node: NodeSnapshot,
  snapshot: ComponentSetSnapshot,
): Piece[] | undefined {
  const segments = node.textSegments;
  if (segments && segments.length > 0) {
    return segments.map((segment) => segmentPiece(segment, snapshot));
  }
  if (node.fillsMixed) return undefined;
  return [
    {
      ...paintSource(node.fills, node.fillStyleId, snapshot),
      fontSize: node.fontSize,
      bold: node.bold ?? false,
    },
  ];
}

function segmentPiece(
  segment: TextSegmentSnapshot,
  snapshot: ComponentSetSnapshot,
): Piece {
  return {
    ...paintSource(segment.fills, segment.fillStyleId, snapshot),
    fontSize: segment.fontSize,
    bold: segment.bold ?? false,
  };
}

/**
 * One node's own colour in one mode: its visible solid paints flattened
 * bottom-to-top, at their paint opacity.
 *
 * Node opacity is deliberately **not** applied here. It is a group property -
 * it fades the node's fill and its children together - so `render` applies it
 * once at the group boundary. Folding it in here as well would double-count it
 * for every ancestor fill.
 *
 * A non-solid visible paint (image, gradient) makes the node unresolvable
 * rather than transparent - there is no single colour to measure, and treating
 * it as absent would silently pair the text with whatever is behind the image.
 */
function resolveColor(
  node: NodeSnapshot,
  mode: Mode,
  snapshot: ComponentSetSnapshot,
): Resolved {
  const { paints, style } = paintSource(node.fills, node.fillStyleId, snapshot);
  return resolvePaints(paints, style, mode, snapshot);
}

/**
 * The colour of one already-chosen paint list - the body of `resolveColor`,
 * split out so a styled run resolves through exactly the same rules as a node
 * (#124). Variables, styles, paint opacity and multi-paint compositing must not
 * behave one way for a layer and another way for a run inside it.
 */
function resolvePaints(
  paints: PaintSnapshot[] | undefined,
  style: ColorStyleSnapshot | undefined,
  mode: Mode,
  snapshot: ComponentSetSnapshot,
): Resolved {
  if (!paints || paints.length === 0) return undefined;

  let accumulated: Rgba | undefined;
  let label: string | undefined;
  let contributors = 0;

  for (const paint of paints) {
    if (!paint.visible) continue;
    if (paint.type !== "SOLID") return "non-solid";

    let hex = paint.hex;
    let alpha = paint.opacity;
    let name: string | undefined = style?.name;

    if (paint.boundVariableId) {
      const variable = snapshot.theme?.variables[paint.boundVariableId];
      const resolution = variable?.byMode[mode.modeId];
      if (!variable || !resolution?.ok || !resolution.hex) return "unresolved";
      hex = resolution.hex;
      // The variable's own alpha, not the paint's: binding a colour variable
      // sets the paint opacity from it, so multiplying the two would square it.
      alpha = resolution.alpha ?? 1;
      // A bound variable names the colour more precisely than the style
      // holding it does.
      name = variable.name;
    }
    if (!hex) return "unresolved";

    const here: Rgba = { hex, alpha };
    accumulated = accumulated ? layer(here, accumulated) : here;
    contributors += 1;
    if (label === undefined) label = name ?? hex;
  }

  if (!accumulated) return undefined;
  return {
    rgba: accumulated,
    // Once more than one paint contributes, no single token describes the
    // result, so the composited hex is the honest label.
    label: contributors === 1 ? (label ?? accumulated.hex) : accumulated.hex,
  };
}

/**
 * The two pixels actually on screen: one where the glyph is, one on the surface
 * beside it. Both fold through the same ancestor chain outward from the text.
 *
 * **Group opacity is why this is one walk rather than two.** A frame's opacity
 * applies to the frame composited *as a group* - its own fill plus everything
 * inside it - not to each layer independently. So a 50% frame holding black text
 * on a white fill, over a black page, renders black text (black at 50% over
 * black is still black) on #808080: 5.3:1, not the 2.6:1 you get by fading the
 * text against an already-flattened background. Applying the opacity separately
 * to text and surface double-counts it and invents failures.
 *
 * Hence the fold: layer inward-to-outward, and at each ancestor boundary
 * multiply the accumulated alpha by that ancestor's opacity. Once an enclosing
 * group is translucent nothing below can become opaque again, which is exactly
 * right - the pair genuinely depends on what is behind the group.
 *
 * Returns `undefined` when the variant root is reached without the surface ever
 * becoming opaque: the deliberate "not evaluated" case. The text pixel needs no
 * separate check, since it can only be at least as opaque as the surface it is
 * folded through.
 */
function render(
  candidate: Candidate,
  own: Rgba,
  mode: Mode,
  snapshot: ComponentSetSnapshot,
): Rendered | "unresolved" | "non-solid" | undefined {
  let text = own;
  let background: Rgba | undefined;
  /** The nearest ancestor fill that contributed, for naming the pair. */
  let nearest: { rgba: Rgba; label: string } | undefined;

  // The **whole** chain, with no early exit once the surface turns opaque.
  // Reaching opacity is not the end of the story: an outer group can still fade
  // the composite over whatever is beyond it, changing both pixels. White text
  // on an opaque black surface inside a 50% wrapper over white is white on
  // #808080 - 3.9:1, a fail - not the 21:1 that stopping at the black surface
  // reports. Chains here are a handful of levels deep, so walking all of them
  // costs nothing worth trading correctness for; past an opaque surface each
  // further `layer` is a no-op anyway.
  for (const ancestor of candidate.ancestors) {
    // A fill sitting entirely behind an already-opaque composite contributes
    // nothing, so it is not resolved at all. That is not just an optimisation:
    // an opaque card over a frame carrying a hero image would otherwise report
    // "gradient or image, cannot measure" for a pairing that is in fact
    // perfectly well defined. Group opacity below still applies - if it fades
    // the composite back below opacity, the next ancestor's fill *is* resolved,
    // and an image there genuinely does make the pair unmeasurable.
    const hidden = background !== undefined && background.alpha >= OPAQUE;

    if (!hidden) {
      const resolved = resolveColor(ancestor, mode, snapshot);
      if (resolved === "non-solid") return "non-solid";
      if (resolved === "unresolved") return "unresolved";

      // A node with no fill of its own still forms a group, so its opacity
      // applies even though it contributes no colour.
      if (resolved !== undefined) {
        text = layer(text, resolved.rgba);
        background = background
          ? layer(background, resolved.rgba)
          : resolved.rgba;
        if (nearest === undefined) nearest = resolved;
      }
    }

    const groupOpacity = ancestor.opacity ?? 1;
    if (groupOpacity !== 1) {
      text = { hex: text.hex, alpha: text.alpha * groupOpacity };
      if (background) {
        background = {
          hex: background.hex,
          alpha: background.alpha * groupOpacity,
        };
      }
    }
  }

  if (!background || background.alpha < OPAQUE) return undefined;

  // The nearest fill's own name, but only when it is demonstrably the colour on
  // screen: opaque on its own, and unchanged by everything outside it. Anything
  // else is a composite that no single token describes, so the rendered hex is
  // the honest label.
  const named =
    nearest !== undefined &&
    nearest.rgba.alpha >= OPAQUE &&
    nearest.rgba.hex === background.hex
      ? nearest.label
      : background.hex;

  return { text, background, label: named };
}

/** A ratio as designers write it: "4.1", "21". Truncated, never rounded up. */
function formatRatio(ratio: number): string {
  const truncated = (Math.floor(ratio * 10) / 10).toFixed(1);
  return truncated.endsWith(".0") ? truncated.slice(0, -2) : truncated;
}

function quoteColour(label: string): string {
  // Hex is already unambiguous; a token name needs quoting to read as a name.
  return label.startsWith("#") ? label : `"${label}"`;
}

function failureFinding(failure: Failure): Finding {
  const where = failure.modeName ? ` in mode "${failure.modeName}"` : "";
  const size = failure.large ? "large" : "normal";
  return {
    severity: "high",
    nodeId: failure.nodeId,
    nodeName: failure.nodeName,
    message: `Text ${quoteColour(failure.foreground)} on ${quoteColour(
      failure.background,
    )} is ${formatRatio(failure.ratio)}:1${where}, below the WCAG AA minimum for ${size} text.`,
    expected: `at least ${formatRatio(failure.required)}:1 (WCAG AA, ${size} text)`,
    actual: `${formatRatio(failure.ratio)}:1`,
    suggestedFix:
      "Darken the text token or lighten the surface token for this pair; if the pairing is deliberate, it needs a documented exception.",
    count: failure.count,
  };
}

/**
 * One low-severity finding covering every layer that was not evaluated.
 * A layer can collect more than one reason across modes; the highest-precedence
 * one is reported so the per-reason counts sum to the total.
 */
function skipTally(
  skipped: Map<string, SkipReason[]>,
  candidates: Candidate[],
): Finding | undefined {
  if (skipped.size === 0) return undefined;

  const counts = new Map<SkipReason, number>();
  for (const reasons of skipped.values()) {
    const reason =
      SKIP_PRECEDENCE.find((r) => reasons.includes(r)) ?? reasons[0];
    counts.set(reason, (counts.get(reason) ?? 0) + 1);
  }

  const parts = [...counts.entries()]
    .sort((a, b) => {
      const byCount = b[1] - a[1];
      if (byCount !== 0) return byCount;
      return SKIP_PRECEDENCE.indexOf(a[0]) - SKIP_PRECEDENCE.indexOf(b[0]);
    })
    .map(
      ([reason, count]) =>
        `${count} ${count === 1 ? SKIP_PHRASES[reason].one : SKIP_PHRASES[reason].many}`,
    );

  const total = skipped.size;
  const subject =
    total === 1
      ? "1 text layer was not evaluated for contrast"
      : `${total} text layers were not evaluated for contrast`;
  const first = candidates.find((c) => skipped.has(c.node.id))?.node;

  return {
    severity: "low",
    nodeId: first?.id ?? "",
    nodeName: first?.name ?? "",
    message: `${subject}: ${parts.join(", ")}.`,
    expected: "a resolvable text colour over an opaque background",
    actual: "not enough resolvable colour information to measure",
    suggestedFix:
      "Check these layers by eye, or give the layer an explicit background so the pairing is unambiguous.",
    count: total,
  };
}

/**
 * Whether this variant is an inactive control.
 *
 * WCAG 1.4.3 exempts "inactive user interface components" from contrast
 * requirements: a disabled control is *meant* to read as faded, so failing it is
 * reporting a defect that does not exist and cannot be fixed. Left in, disabled
 * states dominate the row - three of the four failures on the first real set
 * this ran against - and a row full of unfixable failures is one designers learn
 * to skip, which costs more than the coverage is worth.
 *
 * Read from the variant properties, which is the only place the snapshot can see
 * it: either a value of "Disabled" on any property (`State=Disabled`) or a
 * boolean property named "Disabled" that is on. A set that spells it some other
 * way will not be caught, and that is stated in the row's caveat rather than
 * left as a silent assumption.
 *
 * A variant whose combination Figma refused to report reads as *not* disabled
 * here, so it is measured. That is the safe direction - measuring an exempt
 * variant costs a finding a designer can dismiss, where skipping a real one
 * hides a defect - but it is still a wrong answer, so the row's caveat names it.
 */
function isDisabledVariant(variant: {
  variantProperties: Record<string, string>;
}): boolean {
  return Object.entries(variant.variantProperties).some(([name, value]) => {
    const v = value.trim().toLowerCase();
    if (v === "disabled") return true;
    return name.trim().toLowerCase() === "disabled" && v === "true";
  });
}

/** Why a `not_applicable` row found nothing - never left blank. */
function nothingToMeasureNote(
  snapshot: ComponentSetSnapshot,
  disabledCount: number,
): string {
  if (disabledCount > 0 && disabledCount === snapshot.variants.length) {
    return `Every variant here is a disabled state, and WCAG exempts inactive controls from contrast requirements, so there is nothing to measure.`;
  }
  return "This set has no text layers of its own, so there is nothing to measure. Text inside a nested instance belongs to that component and is checked when it is the subject, so a component assembled entirely from other components reports nothing here.";
}

function buildNote(
  theme: ThemeSnapshot | undefined,
  modes: Mode[],
  disabledCount: number,
  unreadableCount: number,
): string {
  const scope =
    "Contrast is measured against the nearest ancestor with a solid fill, so sibling geometry and images behind a layer are not considered. Text whose colour changes mid-sentence is measured per styled run, and a layer counts once per colour pair however many of its runs share it.";
  const disabled =
    disabledCount > 0
      ? ` ${disabledCount} disabled ${disabledCount === 1 ? "variant was" : "variants were"} not evaluated, since WCAG exempts inactive controls; that is recognised from a "Disabled" variant property, so a set naming it differently would still be measured.`
      : "";
  // Named for the same reason the disabled clause names its own blind spot: an
  // unreadable combination cannot be recognised as a disabled state, so those
  // variants were measured whether or not WCAG exempts them.
  const unreadable =
    unreadableCount > 0
      ? ` ${unreadableCount} ${unreadableCount === 1 ? "variant was" : "variants were"} measured without knowing their property combination, which Figma refused to report - so a disabled state among them was not recognised as one. See row 13.`
      : "";
  if (theme?.collectionName && modes.length > 0 && modes[0].modeId) {
    const list = modes.map((m) => m.name).join(", ");
    return `Evaluated collection "${theme.collectionName}" across ${modes.length} modes: ${list}. ${scope}${disabled}${unreadable}`;
  }
  return `No theme modes were available, so contrast was measured once against the colours as they currently resolve. ${scope}${disabled}${unreadable}`;
}
