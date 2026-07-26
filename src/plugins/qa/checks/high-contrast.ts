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
 * Granularity is the layer, not the character range: mixed fills are not
 * evaluated (picking "the first fill" would be confidently wrong), and a mixed
 * font size is judged at its smallest, so the strictest applicable threshold
 * wins.
 *
 * **AA, dual threshold, no warn tier**: 4.5:1 normally, 3:1 for large text
 * (>= 24px, or >= 18.66px bold). AA is the standard, and a warn band for AAA
 * would be noise. Invisible text needs no special case - it arrives as the
 * ratio-1.0 extreme, which is why #17 leaves it here.
 *
 * Findings are one per **colour pair x mode** with an occurrence count (#100),
 * naming tokens rather than hex wherever both sides are bound: the fix is one
 * token pair, and names are what a designer can act on. Distinct pairs are
 * never merged - `State=Disabled` legitimately has lower contrast than
 * `Default`, so keying on anything but the pair would hide one behind the other.
 */

import type {
  ColorStyleSnapshot,
  ComponentSetSnapshot,
  NodeSnapshot,
  PaintSnapshot,
  ThemeSnapshot,
} from "../snapshot";
import type { CheckResult, CheckStatus, Finding } from "../types";
import { AA_NORMAL, contrastRatio, layer, requiredRatio } from "../contrast";
import type { Rgba } from "../contrast";

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
  | "unresolved-colour"
  | "no-background";

const SKIP_PHRASES: Record<SkipReason, { one: string; many: string }> = {
  "mixed-fill": {
    one: "uses per-character fills",
    many: "use per-character fills",
  },
  "no-fill": {
    one: "has no solid fill to measure",
    many: "have no solid fill to measure",
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
 * A colour resolved for one node in one mode. `undefined` means "this node
 * paints nothing" (a transparent ancestor, which the walk passes straight
 * through); `"unresolved"` means a source was found but could not be resolved,
 * which is a skip rather than a transparent layer.
 */
type Resolved = { rgba: Rgba; label: string } | "unresolved" | undefined;

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
  const candidates: Candidate[] = [];
  for (const variant of snapshot.variants) {
    collectCandidates(variant.tree, [], candidates);
  }

  if (candidates.length === 0) {
    return {
      checkId: "high-contrast",
      title: TITLE,
      status: "not_applicable",
      findings: [],
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
    // Mixed fills are mode-independent, so this is settled before any mode is
    // considered - and settled once, not once per mode.
    if (node.fillsMixed) {
      skip(node, "mixed-fill");
      continue;
    }

    for (const mode of modes) {
      const own = resolveColor(node, mode, snapshot);
      if (own === undefined) {
        skip(node, "no-fill");
        break;
      }
      if (own === "unresolved") {
        skip(node, "unresolved-colour");
        continue;
      }

      // The text layer's own opacity, applied here for the same reason
      // `resolveColor` leaves it out: it is a group property, and the text is
      // its own (leaf) group.
      const selfOpacity = node.opacity ?? 1;
      const start: Rgba =
        selfOpacity === 1
          ? own.rgba
          : { hex: own.rgba.hex, alpha: own.rgba.alpha * selfOpacity };

      const rendered = render(candidate, start, mode, snapshot);
      if (rendered === "unresolved") {
        skip(node, "unresolved-colour");
        continue;
      }
      if (rendered === undefined) {
        skip(node, "no-background");
        continue;
      }

      const ratio = contrastRatio(rendered.text.hex, rendered.background.hex);
      const required = requiredRatio(node.fontSize, node.bold ?? false);
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
        existing.count += 1;
        // One rendered pair is one row, so a group holding both normal and
        // large text is described by its strictest member - the count covers
        // the rest. Splitting on the threshold instead would put the same
        // colour pair on two rows, which the ticket rules out.
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
    note: buildNote(snapshot.theme, modes),
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

/** The paints backing a node, and the style name when they came from a style. */
function paintSource(
  node: NodeSnapshot,
  snapshot: ComponentSetSnapshot,
): { paints: PaintSnapshot[] | undefined; style?: ColorStyleSnapshot } {
  const styleId = node.fillStyleId;
  if (styleId && styleId !== "MIXED") {
    const style = snapshot.colorStyles?.[styleId];
    // A style the collector could not resolve falls back to the node's own
    // fills, which Figma keeps in sync with the style: the name is lost, the
    // colour is not.
    if (style) return { paints: style.paints, style };
  }
  return { paints: node.fills };
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
  const { paints, style } = paintSource(node, snapshot);
  if (!paints || paints.length === 0) return undefined;

  let accumulated: Rgba | undefined;
  let label: string | undefined;
  let contributors = 0;

  for (const paint of paints) {
    if (!paint.visible) continue;
    if (paint.type !== "SOLID") return "unresolved";

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
): Rendered | "unresolved" | undefined {
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
    const resolved = resolveColor(ancestor, mode, snapshot);
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

function buildNote(theme: ThemeSnapshot | undefined, modes: Mode[]): string {
  const scope =
    "Contrast is measured against the nearest ancestor with a solid fill, so sibling geometry and images behind a layer are not considered, and text is judged per layer rather than per character range.";
  if (theme?.collectionName && modes.length > 0 && modes[0].modeId) {
    const list = modes.map((m) => m.name).join(", ");
    return `Evaluated collection "${theme.collectionName}" across ${modes.length} modes: ${list}. ${scope}`;
  }
  return `No theme modes were available, so contrast was measured once against the colours as they currently resolve. ${scope}`;
}
