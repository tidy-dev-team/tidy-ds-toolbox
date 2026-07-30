/// <reference types="@figma/plugin-typings" />

/**
 * Resize measurement for #7's unshipped half (issue #111) - the third and last
 * figma-touching piece of the QA engine's checking side, beside `collector.ts` and
 * `theme-probe.ts`.
 *
 * **Why a scratch clone is unavoidable here.** Every other check in this engine
 * answers its question from the snapshot, because the thing it asks about is
 * recorded in the file. Resize behaviour is not: the snapshot records the component
 * *as it sits*, and the question is what happens to it at a width it is not
 * currently at. No field answers that, so the only way to know is to build one and
 * look. That is the same reasoning the theme probe documents, one step further -
 * it pins a mode on a scratch frame, this drives a width on a scratch clone.
 *
 * **Read-only carve-out.** `tidy_qa_run` is a Query, which ADR-0001 defines as
 * read-only. This creates and removes nodes, so it is a documented exception rather
 * than an accident, and the exception is narrow in exactly the way the ADR requires:
 * the component set itself is never touched, only an instance of it, and every node
 * created is removed in a `finally` on every path. See `theme-probe.ts` for the
 * precedent and `docs/adr/0001` for the rule.
 *
 * **Geometry only.** Nothing here rasterises, exports, or looks at a pixel. The
 * probe records boxes; `resize/anomalies.ts` decides what a box arrangement means,
 * purely and with fixtures. Vision was considered and deliberately not used: on a
 * healthy design system this costs one instance and a few measurements, where the
 * naive render-everything approach costs 48 images per component.
 */

import {
  detectAnomalies,
  detectBoundAnomalies,
  type Anomaly,
} from "./resize/anomalies";
import type { MeasuredNode, Measurement } from "./resize/measured";
import {
  planResizeProbe,
  STRESS_TEXT,
  textPropertyKeys,
  type DrivePath,
} from "./resize/plan";
import { markProbe, sweepQaProbes, withProbeFrame } from "./theme-probe";
import type {
  ComponentSetSnapshot,
  NodeSnapshot,
  ResizeProbeSnapshot,
  VariantSnapshot,
} from "./snapshot";

/** Cosmetic, like the theme probe's: ownership is the plugin-data marker's job. */
const PROBE_NAME = "__tidy-qa-resize-probe";

/**
 * Where the scratch frame is parked.
 *
 * Far off to the side rather than hidden, because hidden is not an option: Figma
 * reports no `absoluteBoundingBox` for an invisible node, and measurement is the
 * whole point. So the frame is visible for the few milliseconds it exists, and
 * placed somewhere it cannot land on top of the designer's work.
 */
const PARK_AT = 200_000;

/** How much the root has to move for the drive to count as having taken effect. */
const MOVED_PX = 0.5;

function toBox(rect: Rect) {
  return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
}

/**
 * Measure the clone against the snapshot tree, in lockstep.
 *
 * Walking both trees together is what makes the measurement addressable: the
 * clone's node ids stop existing when it is torn down, so a finding naming them
 * could not be jumped to. Every measured node therefore carries the *source* id -
 * the layer in the real component - which is what a designer opens.
 *
 * It also settles how deep to measure for free: the snapshot stops at nested
 * instances, whose interiors belong to another component (#8), so this stops there
 * too. The instance's own box is still measured, because overflow and overlap are
 * questions about that box.
 *
 * Pairing is by position, which is sound here and nowhere else: this is a *fresh
 * instance* of the very component the snapshot was taken from, so its structure is
 * the snapshot's structure by construction. Length is still guarded rather than
 * assumed, because a mismatch should degrade to measuring less, never to pairing a
 * box with the wrong layer's identity.
 */
function measureNode(clone: SceneNode, source: NodeSnapshot): MeasuredNode {
  const bounds = clone.absoluteBoundingBox;
  // Guarded rather than read directly: a couple of SceneNode subtypes (StickyNode
  // among them) have no render bounds at all, and none of them can appear inside a
  // component instance - but the type union does not know that.
  const render =
    "absoluteRenderBounds" in clone ? clone.absoluteRenderBounds : null;
  const measured: MeasuredNode = {
    id: source.id,
    name: source.name,
    type: source.type,
    visible: clone.visible,
    // A node Figma reports no bounds for (it draws nothing, or is hidden) is
    // recorded at zero size rather than skipped, so the tree keeps its shape and
    // the anomaly rules - which already ignore hidden nodes - stay in charge of
    // what gets judged.
    box: bounds
      ? toBox(bounds)
      : { x: 0, y: 0, width: clone.width, height: clone.height },
    ...(render ? { renderBox: toBox(render) } : {}),
    ...("clipsContent" in clone ? { clipsContent: clone.clipsContent } : {}),
    children: [],
  };

  if (source.children.length > 0 && "children" in clone) {
    const pairs = Math.min(source.children.length, clone.children.length);
    for (let i = 0; i < pairs; i += 1) {
      measured.children.push(
        measureNode(clone.children[i], source.children[i]),
      );
    }
  }
  return measured;
}

/**
 * The variant to instance, and its snapshot tree.
 *
 * Exported because the canvas op needs exactly the same answer when it builds an
 * evidence block: the picture has to be of the variant that was measured, and two
 * copies of "resolve the default variant, then find its snapshot entry" could drift
 * into illustrating a different variant than the row describes.
 */
export function chooseVariant(
  subject: ComponentSetNode | ComponentNode,
  snapshot: ComponentSetSnapshot,
): { component: ComponentNode; variant: VariantSnapshot } | undefined {
  const component =
    subject.type === "COMPONENT_SET" ? subject.defaultVariant : subject;
  if (!component) return undefined;
  // Matched by id rather than assumed to be the first: `defaultVariant` is
  // whichever variant Figma considers default, which is not necessarily the
  // snapshot's first entry.
  const variant = snapshot.variants.find((v) => v.id === component.id);
  return variant ? { component, variant } : undefined;
}

/**
 * Configure a frame for the chosen drive path, append the instance to it, and return
 * how to drive a width through it.
 *
 * The `FILL` path is the one with a trap in it: a `FILL` instance resized directly
 * does not move at all, because `FILL` means "take your width from your parent". So
 * the frame becomes an auto-layout parent, the instance is told to fill it, and the
 * *frame* is what gets resized. Getting this wrong produces a confident pass on a
 * component that was never measured, which is why the path is decided in
 * `planResizeProbe` and tested there.
 *
 * Exported, and imported by the render layer, which is otherwise kept clear of the
 * checking half. The alternative is a second implementation of exactly this trap
 * inside `renderStateGrid.ts`, and if the two ever disagreed the evidence block
 * would draw a component that had not actually resized - a picture contradicting the
 * finding it exists to prove. One implementation is worth the import.
 */
export function driveWidthThrough(
  frame: FrameNode,
  instance: InstanceNode,
  path: DrivePath,
  baselineWidth: number,
): (width: number) => void {
  if (path === "parent") {
    frame.layoutMode = "HORIZONTAL";
    // The frame's width is driven; its height follows the instance, so the
    // measurement is never distorted by a frame taller than its content.
    frame.primaryAxisSizingMode = "FIXED";
    frame.counterAxisSizingMode = "AUTO";
    frame.paddingTop = 0;
    frame.paddingBottom = 0;
    frame.paddingLeft = 0;
    frame.paddingRight = 0;
    frame.itemSpacing = 0;
    frame.appendChild(instance);
    instance.layoutSizingHorizontal = "FILL";
    frame.resize(baselineWidth, frame.height);
    return (width) => frame.resize(width, frame.height);
  }

  frame.layoutMode = "NONE";
  frame.appendChild(instance);
  return (width) => instance.resize(width, instance.height);
}

/**
 * Measure the instance once, now.
 *
 * Rests on layout recomputation being synchronous after `resize()`, so that
 * post-resize `absoluteBoundingBox` values are readable in the same tick. That
 * assumption is load-bearing for the whole design, and rather than trust it, the
 * probe checks it: if no driven width moves the root at all, `unmoved` is recorded
 * and the row reports the resize half as not established instead of as a pass. A
 * broken assumption therefore surfaces as a stated limitation, never as a wrong
 * green.
 */
function measure(
  instance: InstanceNode,
  variant: VariantSnapshot,
  requestedWidth: number,
  label: string,
): Measurement {
  return {
    requestedWidth,
    label,
    root: measureNode(instance, variant.tree),
  };
}

/**
 * Drive the width both ways, and long text through it, and report what drifted.
 *
 * Returns `skipped` rather than throwing for every case where there is nothing to
 * measure, because "this component hugs its content" is a fact about the component
 * worth printing on the row, not an error.
 */
export async function probeResizeBehaviour(
  subject: ComponentSetNode | ComponentNode,
  snapshot: ComponentSetSnapshot,
): Promise<ResizeProbeSnapshot> {
  // Shared with the theme probe: a run that probes only resize still clears
  // whatever an earlier killed sandbox left behind.
  sweepQaProbes();

  const chosen = chooseVariant(subject, snapshot);
  if (!chosen) {
    return {
      skipped:
        "the set has no default variant to instance, so there is nothing to resize.",
    };
  }
  const { component, variant } = chosen;

  const planned = planResizeProbe(variant.tree);
  if ("skipped" in planned) {
    return {
      variantId: variant.id,
      variantName: variant.name,
      skipped: planned.skipped,
    };
  }
  const { plan } = planned;

  const bounds = {
    ...(variant.tree.minWidth !== undefined
      ? { minWidth: variant.tree.minWidth }
      : {}),
    ...(variant.tree.maxWidth !== undefined
      ? { maxWidth: variant.tree.maxWidth }
      : {}),
  };

  const anomalies: Anomaly[] = [];
  const states: string[] = [];
  let unmoved = true;
  let textStress: ResizeProbeSnapshot["textStress"];

  // Creation, configuration and removal all belong to withProbeFrame, which
  // guarantees the frame goes away on every path it can reach (#131) - including
  // the paths where a resize or a property write throws part-way through.
  await withProbeFrame<FrameNode, void>(
    {
      create: () => figma.createFrame(),
      prepare: (frame) => {
        // Claimed first, so the window in which the frame exists unmarked - and
        // would therefore survive a later sweep - is as small as possible.
        markProbe(frame);
        frame.name = PROBE_NAME;
        frame.fills = [];
        // Must not clip: a clipping scratch frame would manufacture exactly the
        // overflow the probe is looking for.
        frame.clipsContent = false;
        frame.x = PARK_AT;
        frame.y = PARK_AT;
        figma.currentPage.appendChild(frame);
      },
      // The frame is created and removed within this one call, so there is never
      // a stray of its own to find; the shared sweep above covers a killed
      // sandbox.
      strayProbes: () => [],
    },
    (frame) => {
      // `createInstance` parents to the *current page* the moment it is called, and
      // only becomes the frame's child inside `driveWidthThrough`. Anything throwing
      // between those two points - a frame property write on the FILL path - would
      // leave the instance orphaned on the page, because `withProbeFrame`'s `finally`
      // removes only the frame. Worse, nothing could ever reclaim it: `isStrayProbe`
      // requires `type === "FRAME"`, so an orphaned instance is invisible to every
      // future sweep. Hence its own `finally`, which is a no-op once the instance is
      // safely inside the frame and the frame takes it on the way out.
      const instance = component.createInstance();
      try {
        const drive = driveWidthThrough(
          frame,
          instance,
          plan.path,
          plan.baselineWidth,
        );

        const baseline = measure(
          instance,
          variant,
          plan.baselineWidth,
          `at its default ${plan.baselineWidth}px`,
        );

        for (const target of plan.targets) {
          drive(target.width);
          const state = measure(instance, variant, target.width, target.label);
          states.push(target.label);
          if (
            Math.abs(state.root.box.width - baseline.root.box.width) > MOVED_PX
          ) {
            unmoved = false;
          }
          anomalies.push(...detectAnomalies(baseline, state));
          anomalies.push(...detectBoundAnomalies(state, bounds));
        }

        // Long text, at the component's own width. Restoring the width first means
        // any clipping found belongs to the text rather than to the last drive.
        const textKeys = textPropertyKeys(snapshot);
        if (textKeys.length === 0) {
          textStress = {
            skipped:
              "the component defines no text properties, so there is no text to lengthen.",
          };
        } else {
          drive(plan.baselineWidth);
          try {
            instance.setProperties(
              Object.fromEntries(textKeys.map((key) => [key, STRESS_TEXT])),
            );
            const stressed = measure(
              instance,
              variant,
              plan.baselineWidth,
              "with long text in every text property",
            );
            textStress = {
              anomalies: [
                ...detectAnomalies(baseline, stressed),
                ...detectBoundAnomalies(stressed, bounds),
              ],
            };
          } catch (error) {
            // A text property Figma refuses to set - a missing font on the bound
            // layer is the common one - is a limitation to state, not a failed run.
            // The width passes above have already been recorded either way.
            textStress = {
              skipped: `Figma would not set the text properties: ${
                error instanceof Error ? error.message : String(error)
              }`,
            };
          }
        }
      } finally {
        if (!instance.removed) instance.remove();
      }
    },
  );

  return {
    variantId: variant.id,
    variantName: variant.name,
    baselineWidth: plan.baselineWidth,
    states,
    anomalies,
    ...(unmoved ? { unmoved: true } : {}),
    ...(textStress ? { textStress } : {}),
  };
}
