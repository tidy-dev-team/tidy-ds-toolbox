import { describe, it, expect } from "vitest";
import {
  readStampedKeys,
  indexPriorArtifacts,
  removeIfPresent,
  type StampedFrame,
} from "./prior-artifacts";

const CHECKLIST = "tidy:qa-checklist";
const SHOWCASE = "tidy:qa-mode-showcase";
const EVIDENCE = "tidy:qa-resize-evidence";

/** Stand-in for a FrameNode; the index never touches anything but identity. */
function frame(name: string) {
  return { name };
}

describe("indexPriorArtifacts", () => {
  it("finds the frames stamped for this target, per key", () => {
    const mine = frame("mine");
    const stamped: StampedFrame<{ name: string }>[] = [
      { frame: mine, data: { [SHOWCASE]: "1:2" } },
      { frame: frame("someone else's"), data: { [SHOWCASE]: "9:9" } },
    ];

    const index = indexPriorArtifacts(stamped, "1:2");

    expect(index.matching(SHOWCASE)).toEqual([mine]);
  });

  it("keeps the keys apart, so one block's removal never takes another's", () => {
    const showcase = frame("showcase");
    const evidence = frame("evidence");
    const stamped: StampedFrame<{ name: string }>[] = [
      { frame: showcase, data: { [SHOWCASE]: "1:2" } },
      { frame: evidence, data: { [EVIDENCE]: "1:2" } },
    ];

    const index = indexPriorArtifacts(stamped, "1:2");

    // Same target, same run, different blocks. Collapsing the four walks into
    // one must not collapse the four keys into one.
    expect(index.matching(SHOWCASE)).toEqual([showcase]);
    expect(index.matching(EVIDENCE)).toEqual([evidence]);
  });

  it("returns every copy for a key, not just the first", () => {
    const a = frame("a");
    const b = frame("b");
    const stamped: StampedFrame<{ name: string }>[] = [
      { frame: a, data: { [EVIDENCE]: "1:2" } },
      { frame: b, data: { [EVIDENCE]: "1:2" } },
    ];

    // A designer can duplicate a block. The old per-key walk removed both, and
    // leaving one behind would stack a second copy beside the rebuilt one.
    expect(indexPriorArtifacts(stamped, "1:2").matching(EVIDENCE)).toEqual([
      a,
      b,
    ]);
  });

  it("hands back the raw value for keys whose stamp is not a bare target id", () => {
    const checklist = frame("checklist");
    const stamped: StampedFrame<{ name: string }>[] = [
      {
        frame: checklist,
        data: { [CHECKLIST]: '{"targetId":"1:2","anchorId":"3:4"}' },
      },
    ];

    const index = indexPriorArtifacts(stamped, "1:2");

    // The checklist stamps a JSON object rather than a plain id, so matching it
    // is the caller's job; the index only has to not lose it.
    expect(index.matching(CHECKLIST)).toEqual([]);
    expect(index.raw(CHECKLIST)).toEqual([
      { frame: checklist, value: '{"targetId":"1:2","anchorId":"3:4"}' },
    ]);
  });

  it("answers an unstamped key with nothing rather than undefined", () => {
    const index = indexPriorArtifacts([], "1:2");

    // Callers iterate the result directly; a missing key must be an empty list.
    expect(index.matching(SHOWCASE)).toEqual([]);
    expect(index.raw(CHECKLIST)).toEqual([]);
  });
});

describe("removeIfPresent", () => {
  it("removes a node that is still there", () => {
    let removed = false;
    removeIfPresent({
      get removed() {
        return removed;
      },
      remove: () => {
        removed = true;
      },
    });

    expect(removed).toBe(true);
  });

  it("leaves an already-removed node alone instead of throwing", () => {
    let calls = 0;
    // The hazard the single pass introduces, and the reason this guard exists:
    // each per-key walk used to run immediately before its own removals, so it
    // could never hand back a node that had since gone. One up-front index can,
    // and Figma throws on member access of a removed node.
    removeIfPresent({
      removed: true,
      remove: () => {
        calls += 1;
      },
    });

    expect(calls).toBe(0);
  });
});

describe("readStampedKeys", () => {
  /**
   * Stand-in for a node's plugin-data surface, counting the reads so the test
   * can assert the round-trip cost rather than only the answer. That cost is
   * the whole point of this function: every call here is a sandbox round trip,
   * paid once per frame in the document.
   */
  function node(data: Record<string, string>) {
    const reads: string[] = [];
    let keyListings = 0;
    return {
      reads,
      keyListings: () => keyListings,
      getPluginDataKeys: () => {
        keyListings += 1;
        return Object.keys(data);
      },
      getPluginData: (key: string) => {
        reads.push(key);
        return data[key] ?? "";
      },
    };
  }

  it("reads only the requested keys the node actually carries", () => {
    const n = node({ [SHOWCASE]: "1:2" });

    expect(readStampedKeys(n, [CHECKLIST, SHOWCASE, EVIDENCE])).toEqual({
      [SHOWCASE]: "1:2",
    });
    expect(n.reads).toEqual([SHOWCASE]);
  });

  it("costs one call on a frame carrying none of the keys", () => {
    // The common case by an enormous margin: almost every frame in a design
    // system file has no plugin data of ours at all. Asking each of them for
    // every key in turn is what made this a per-key cost per frame.
    const n = node({});

    expect(readStampedKeys(n, [CHECKLIST, SHOWCASE, EVIDENCE])).toBeNull();
    expect(n.reads).toEqual([]);
    expect(n.keyListings()).toBe(1);
  });

  it("ignores plugin data belonging to another feature", () => {
    const n = node({ "tidy:doc-page": "1:2" });

    expect(readStampedKeys(n, [CHECKLIST])).toBeNull();
    expect(n.reads).toEqual([]);
  });

  it("keeps every requested key the node carries", () => {
    const n = node({ [SHOWCASE]: "1:2", [EVIDENCE]: "1:2" });

    expect(readStampedKeys(n, [CHECKLIST, SHOWCASE, EVIDENCE])).toEqual({
      [SHOWCASE]: "1:2",
      [EVIDENCE]: "1:2",
    });
  });

  it("treats a listed key with an empty value as absent", () => {
    // Figma deletes a key when its value is set to "", so a listed-but-empty
    // key should not arise. The guard stays because the old code skipped empty
    // values too, and dropping it would let one into the index as a match.
    const n = node({ [SHOWCASE]: "" });

    expect(readStampedKeys(n, [SHOWCASE])).toBeNull();
  });
});
