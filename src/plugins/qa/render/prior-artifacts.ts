/// <reference types="@figma/plugin-typings" />

/**
 * The prior canvas artifacts a checklist rebuild has to replace, found in one
 * pass instead of four (#179).
 *
 * `tidy_qa_build_checklist` used to traverse the whole document four separate
 * times before drawing anything: once for the prior checklist frame, and once
 * each for the mode showcase, the resize evidence and the contact sheet. Three
 * of those were `findAll` with an arbitrary predicate, which visits every node
 * on every page and calls `getPluginData` on each one, and all four were the
 * same question asked about a different key.
 *
 * The cost is paid on design system files, which are the largest the team has,
 * and it is paid before any useful work starts - including on a healthy
 * component where two of the three blocks will not be drawn at all, because the
 * clearing is unconditional by design. That unconditional clearing is not the
 * problem and must not be traded away: a component that has since been fixed
 * must not keep last run's broken-state pictures beside a freshly rebuilt
 * checklist, where they read as current.
 *
 * The same lesson is already recorded one module along, in tidy-doc's
 * `buildRelatedSection`: "one-shot file-wide scan ... rather than re-running
 * loadAllPagesAsync + findAllWithCriteria per key".
 */

/** One frame, with whatever the requested keys hold on it. */
export interface StampedFrame<F> {
  frame: F;
  /** Raw plugin-data per requested key. Keys with no value are omitted. */
  data: Readonly<Record<string, string>>;
}

/**
 * A lookup over one traversal's findings.
 *
 * Two accessors rather than one, because the four keys do not stamp the same
 * shape: three write the bare target id, and the checklist writes a JSON stamp
 * carrying its target plus the anchor it was placed against. Rather than teach
 * this module to parse that, `raw` hands the value back and lets the caller
 * that owns the shape decide.
 */
export interface PriorArtifactIndex<F> {
  /** Frames whose value for `key` is exactly the target id. */
  matching(key: string): F[];
  /** Every frame carrying a non-empty value for `key`, with that value. */
  raw(key: string): Array<{ frame: F; value: string }>;
}

/**
 * Builds the lookup from one traversal's findings.
 *
 * Pure and generic over the frame type, so the grouping is fixture-tested
 * rather than trusted - it is the piece that decides which blocks get removed,
 * and a key collapsed into another here would delete a block the run still
 * wanted.
 */
export function indexPriorArtifacts<F>(
  stamped: readonly StampedFrame<F>[],
  targetId: string,
): PriorArtifactIndex<F> {
  const byKey = new Map<string, Array<{ frame: F; value: string }>>();
  for (const entry of stamped) {
    for (const [key, value] of Object.entries(entry.data)) {
      if (!value) continue;
      const list = byKey.get(key) ?? [];
      list.push({ frame: entry.frame, value });
      byKey.set(key, list);
    }
  }
  return {
    matching: (key) =>
      (byKey.get(key) ?? [])
        .filter((e) => e.value === targetId)
        .map((e) => e.frame),
    raw: (key) => byKey.get(key) ?? [],
  };
}

/**
 * The one traversal. Loads every page once, walks once, and reads only the
 * keys asked for.
 *
 * Narrowed to frames, which the prior per-key walks were not. Every artifact
 * this indexes is created as a frame and stamped as a frame - `placeStateGrid`
 * and `placeModeShowcase` both take a `FrameNode` - and the checklist's own
 * lookup, the oldest of the four, already narrowed this way. A stamped frame
 * that a designer wraps in a group or a component is still a frame at depth,
 * so it is still found; losing one would take converting the frame itself into
 * another node type, which also destroys the plugin data that identifies it.
 */
export async function collectPriorArtifacts(
  targetId: string,
  keys: readonly string[],
): Promise<PriorArtifactIndex<FrameNode>> {
  await figma.loadAllPagesAsync();
  const stamped: StampedFrame<FrameNode>[] = [];
  for (const frame of figma.root.findAllWithCriteria({ types: ["FRAME"] })) {
    const data: Record<string, string> = {};
    for (const key of keys) {
      const value = frame.getPluginData(key);
      if (value) data[key] = value;
    }
    if (Object.keys(data).length > 0) stamped.push({ frame, data });
  }
  return indexPriorArtifacts(stamped, targetId);
}

/**
 * Removes a node the index found, unless something already has.
 *
 * The guard is new with the single pass and is the cost of it: each per-key
 * walk used to run immediately before its own removals, so it could never hand
 * back a node that had since gone. One up-front index can, and `remove()` on an
 * already-removed node throws.
 */
export function removeIfPresent(node: {
  readonly removed: boolean;
  remove(): void;
}): void {
  if (!node.removed) node.remove();
}
