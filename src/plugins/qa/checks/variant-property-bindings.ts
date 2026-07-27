/**
 * #3 - Check All the Props: is every component property actually **wired** in
 * every variant?
 *
 * Figma splits a component property into two parts that live in different
 * places. The *definition* sits on the component set, so the toggle appears in
 * the properties panel for every variant the moment it is created. The
 * *binding* sits on one layer inside one variant, as
 * `componentPropertyReferences`, and it does **not** propagate when variants are
 * added or duplicated.
 *
 * So a set ships where `Show Left Icon` is wired on Primary and silently missed
 * on Ghost. The designer selects Ghost, sees an identical-looking toggle, flips
 * it, and nothing happens. Figma shows no error and draws no distinction
 * between a wired toggle and a decorative one, because the panel renders the
 * definition and knows nothing about this variant's binding.
 *
 * Three properties of the defect make it survive review:
 * booleans default to off, so the evidence is hidden in the state everyone
 * looks at; two booleans across twelve variants is twenty-four bindings, which
 * nobody verifies by hand; and it surfaces in a consumer's file weeks later,
 * not in the library.
 *
 * **This is a pure snapshot check, not a visual one.** The collector already
 * walks invisible children, so the hidden icon layer is in the tree; the only
 * thing that had to be added was `NodeSnapshot.propertyReferences`. No clone, no
 * resize, no render. It therefore runs across *every* variant rather than a
 * sampled one.
 *
 * **Where bindings can live.** A property reference can only sit on a node in
 * the component's own tree, never inside a nested instance - instance interiors
 * belong to their main component, and nested properties surface through the
 * separate `exposedInstances` mechanism instead. The collector stops at instance
 * boundaries but walks everything above them, which is exactly the region where
 * set-level bindings are expressible. So a missing binding here is a real
 * missing binding, not a blind spot.
 *
 * **The set is its own oracle.** Two of the three findings work by comparing
 * variants against each other rather than against a rule we invented:
 * the layer to fix is identified by name from the variants that *are* wired,
 * and an odd binding target is one that disagrees with the rest of the set.
 * That keeps the check free of naming heuristics - it never guesses that
 * `icon-left` ought to belong to `Show Left Icon`, it only observes that eleven
 * variants agree and one does not.
 */

import type {
  ComponentPropertySnapshot,
  ComponentSetSnapshot,
  NodeSnapshot,
  VariantSnapshot,
} from "../snapshot";
import type { CheckResult, CheckStatus, Finding } from "../types";

const TITLE = "Property bindings across variants";

/**
 * Item 3 asks for more than wiring: cycle the combinations and see nothing
 * breaks, *always* try long text, and confirm icon colour follows text colour -
 * a standing DS invariant, and the concrete failure design found mid-call.
 * This check speaks only to whether each property is connected, so the rest
 * stays a tick on the row.
 *
 * Unconditional, on item 7's logic rather than item 19's: that every property is
 * correctly wired says nothing about whether the states it exposes render
 * correctly, so the remainder is owed on every outcome - including
 * `not_applicable`, where variant combinations and long text still want cycling.
 */
const RENDER_REMAINDER =
  "Cycle the property combinations and confirm nothing breaks - long text " +
  "especially, and that icon colour follows text colour. Only whether each " +
  "property is wired is checked automatically.";

/**
 * Which node property each kind of component property drives, and therefore
 * which `propertyReferences` key carries its binding. `VARIANT` is absent
 * deliberately: variant properties are expressed by the set's children, not by
 * a reference on a layer, so there is nothing to wire.
 */
const REFERENCE_KEY: Record<string, string> = {
  BOOLEAN: "visible",
  INSTANCE_SWAP: "mainComponent",
  TEXT: "characters",
};

/** How many variant names a message spells out before summarising the rest. */
const MAX_NAMED_VARIANTS = 6;

function flatten(root: NodeSnapshot): NodeSnapshot[] {
  return [root, ...root.children.flatMap(flatten)];
}

/** `Size=Small, Variant=Ghost`, falling back to the layer name for standalones. */
function variantLabel(variant: VariantSnapshot): string {
  const pairs = Object.entries(variant.variantProperties);
  if (pairs.length === 0) return variant.name;
  return pairs.map(([prop, value]) => `${prop}=${value}`).join(", ");
}

function listVariants(labels: string[]): string {
  if (labels.length <= MAX_NAMED_VARIANTS) return labels.join("; ");
  const shown = labels.slice(0, MAX_NAMED_VARIANTS).join("; ");
  return `${shown}; and ${labels.length - MAX_NAMED_VARIANTS} more`;
}

interface VariantBinding {
  variant: VariantSnapshot;
  nodes: NodeSnapshot[];
  label: string;
}

function bindingsFor(
  snapshot: ComponentSetSnapshot,
  property: ComponentPropertySnapshot,
  referenceKey: string,
): VariantBinding[] {
  return snapshot.variants.map((variant) => ({
    variant,
    label: variantLabel(variant),
    nodes: flatten(variant.tree).filter(
      (node) => node.propertyReferences?.[referenceKey] === property.key,
    ),
  }));
}

/**
 * The layer in an unwired variant that should almost certainly carry the
 * binding: same name as the layers the wired variants bind, and bound to
 * nothing itself. Variants are usually duplicated, so the layer survives while
 * the binding is lost, which makes this the fix location rather than a guess.
 */
function candidateLayer(
  variant: VariantSnapshot,
  boundNames: Set<string>,
  referenceKey: string,
): NodeSnapshot | undefined {
  return flatten(variant.tree).find(
    (node) =>
      boundNames.has(node.name) &&
      node.propertyReferences?.[referenceKey] === undefined,
  );
}

function partialWiringFinding(
  property: ComponentPropertySnapshot,
  wired: VariantBinding[],
  unwired: VariantBinding[],
  referenceKey: string,
): Finding {
  const boundNames = new Set(
    wired.flatMap((entry) => entry.nodes.map((node) => node.name)),
  );

  // Prefer the fix location as the finding's node, so a caller jumping to it
  // lands on the layer to bind rather than on the variant root.
  const candidates = unwired.map((entry) => ({
    entry,
    layer: candidateLayer(entry.variant, boundNames, referenceKey),
  }));
  const firstWithLayer = candidates.find((c) => c.layer !== undefined);
  const anchor = firstWithLayer?.layer ?? unwired[0].variant.tree;

  // An unbound layer left visible is the nastier shape of the same defect: the
  // icon is always on and cannot be switched off, and it looks correct at rest.
  const stuckVisible = candidates.filter((c) => c.layer?.visible === true);

  const fixLocation = firstWithLayer
    ? ` Layer "${firstWithLayer.layer?.name}" is present and unbound in ` +
      `${candidates.filter((c) => c.layer).length} of them - that is the layer to bind.`
    : "";

  const stuckNote =
    stuckVisible.length > 0
      ? ` In ${stuckVisible.length} of them that layer is left visible, so it ` +
        `shows regardless of the toggle and cannot be switched off.`
      : "";

  return {
    severity: "high",
    nodeId: anchor.id,
    nodeName: anchor.name,
    message:
      `"${property.name}" is not wired in ${unwired.length} of ` +
      `${wired.length + unwired.length} variants: ` +
      `${listVariants(unwired.map((entry) => entry.label))}. ` +
      `The property appears in the panel for these variants but changes ` +
      `nothing.${fixLocation}${stuckNote}`,
    expected: `"${property.name}" bound in every variant`,
    actual: `bound in ${wired.length}, missing in ${unwired.length}`,
    suggestedFix:
      `Select the layer in each listed variant and bind it to ` +
      `"${property.name}".`,
    count: unwired.length,
  };
}

function deadPropertyFinding(
  property: ComponentPropertySnapshot,
  snapshot: ComponentSetSnapshot,
): Finding {
  return {
    severity: "high",
    nodeId: snapshot.id,
    nodeName: snapshot.name,
    message:
      `"${property.name}" (${property.type}) is bound to no layer in any ` +
      `variant. The property appears in the panel and does nothing anywhere.`,
    expected: `"${property.name}" bound in every variant`,
    actual: "bound nowhere",
    suggestedFix:
      `Bind "${property.name}" to the layer it is meant to drive, or delete ` +
      `the property.`,
    count: snapshot.variants.length,
  };
}

/**
 * A variant binding the property to a differently-named layer than the rest of
 * the set - the shape a crossed binding takes, where someone wired the property
 * to the wrong layer.
 *
 * Deliberately decided by majority within the set rather than by reading layer
 * names: this never asks whether `icon-left` "belongs to" `Show Left Icon`, it
 * only observes that most variants agree and one does not. That keeps the check
 * free of name semantics, which is why it can be reported at all.
 *
 * A `warn`, not a `fail`: a variant legitimately built from different layers
 * (an icon-only variant with no label) will disagree without being wrong.
 */
function oddTargetFinding(
  property: ComponentPropertySnapshot,
  wired: VariantBinding[],
): Finding | undefined {
  if (wired.length < 3) return undefined;

  const tally = new Map<string, VariantBinding[]>();
  for (const entry of wired) {
    // Only single-target bindings are comparable; a property driving several
    // layers in one variant has no one name to weigh against the others.
    if (entry.nodes.length !== 1) return undefined;
    const name = entry.nodes[0].name;
    tally.set(name, [...(tally.get(name) ?? []), entry]);
  }
  if (tally.size < 2) return undefined;

  const ranked = [...tally.entries()].sort((a, b) => b[1].length - a[1].length);
  const [majorityName, majority] = ranked[0];
  const odd = ranked.slice(1);

  // Require a clear majority: a two-way split says the set has no convention
  // to violate, and picking a winner would invent one.
  if (majority.length <= wired.length / 2) return undefined;

  const oddEntries = odd.flatMap(([, entries]) => entries);
  const anchor = oddEntries[0].nodes[0];

  return {
    severity: "medium",
    nodeId: anchor.id,
    nodeName: anchor.name,
    message:
      `"${property.name}" is bound to layer "${majorityName}" in ` +
      `${majority.length} of ${wired.length} variants, but to ` +
      `${odd.map(([name, entries]) => `"${name}" in ${entries.length}`).join(", ")}. ` +
      `Check for a crossed binding in: ` +
      `${listVariants(oddEntries.map((entry) => entry.label))}.`,
    expected: `"${property.name}" bound to "${majorityName}" throughout`,
    actual: odd.map(([name]) => `"${name}"`).join(", "),
    suggestedFix:
      `Confirm the listed variants bind the layer they mean to. A variant ` +
      `built from different layers may differ legitimately.`,
    count: oddEntries.length,
  };
}

export function checkVariantPropertyBindings(
  snapshot: ComponentSetSnapshot,
): CheckResult {
  const bindable = snapshot.properties.filter(
    (property) => REFERENCE_KEY[property.type] !== undefined,
  );

  if (bindable.length === 0) {
    return {
      checkId: "variant-property-bindings",
      title: TITLE,
      status: "not_applicable",
      findings: [],
      note:
        "The set declares no boolean, text or instance-swap properties, so " +
        "there is nothing to wire. Variant properties carry no layer binding.",
      manualRemainder: RENDER_REMAINDER,
    };
  }

  const findings: Finding[] = [];
  let hasFail = false;

  for (const property of bindable) {
    const referenceKey = REFERENCE_KEY[property.type];
    const perVariant = bindingsFor(snapshot, property, referenceKey);
    const wired = perVariant.filter((entry) => entry.nodes.length > 0);
    const unwired = perVariant.filter((entry) => entry.nodes.length === 0);

    if (wired.length === 0) {
      findings.push(deadPropertyFinding(property, snapshot));
      hasFail = true;
      continue;
    }

    if (unwired.length > 0) {
      findings.push(
        partialWiringFinding(property, wired, unwired, referenceKey),
      );
      hasFail = true;
    }

    const odd = oddTargetFinding(property, wired);
    if (odd) findings.push(odd);
  }

  const status: CheckStatus = hasFail
    ? "fail"
    : findings.length > 0
      ? "warn"
      : "pass";

  return {
    checkId: "variant-property-bindings",
    title: TITLE,
    status,
    findings,
    ...(status === "pass"
      ? {
          note:
            `All ${bindable.length} bindable propert` +
            `${bindable.length === 1 ? "y is" : "ies are"} wired in every ` +
            `variant. Whether each drives the *right* layer is only checked ` +
            `where the set disagrees with itself.`,
        }
      : {}),
    manualRemainder: RENDER_REMAINDER,
  };
}
