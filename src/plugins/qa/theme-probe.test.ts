/**
 * The probe's lifecycle (issue #131).
 *
 * `theme-probe.ts` is one of the two deliberately figma-touching files in the QA
 * engine, which is why the residue guarantee - no probe node left behind, on any
 * path - rested on reading the code rather than on a test. `withProbeFrame` is
 * the seam that fixes that: it owns create/use/remove and takes the figma calls
 * as an injected env, so the guarantee can be exercised without Figma.
 *
 * A leftover probe is worse than an ordinary stray node: it carries explicit
 * pinned variable modes, and an invisible 1x1 frame with a pinned theme mode in a
 * designer's file is confusing in a way that is hard to trace back to QA.
 */

import { describe, it, expect } from "vitest";
import type { ComponentSetSnapshot } from "./snapshot";
import {
  partitionLookedUpVariables,
  probeThemeResolution,
  isStrayProbe,
  markProbe,
  sweepStrayProbes,
  unmarkProbe,
  withProbeFrame,
  PROBE_NAME,
} from "./theme-probe";

interface FakeProbe {
  id: string;
  removed: number;
  prepared: number;
  remove(): void;
}

/** A node with real plugin-data storage, so marking and matching must agree. */
function fakeNode(type = "FRAME", name = "Frame 1") {
  const data = new Map<string, string>();
  return {
    type,
    name,
    getPluginData: (key: string) => data.get(key) ?? "",
    setPluginData: (key: string, value: string) => void data.set(key, value),
  };
}

/** A probe node that records what the lifecycle did to it. */
function makeProbe(id: string, unremovable = false): FakeProbe {
  const probe: FakeProbe = {
    id,
    removed: 0,
    prepared: 0,
    remove() {
      probe.removed += 1;
      // A node orphaned by a killed sandbox can already be gone by the next run,
      // and Figma throws on member access of a removed node.
      if (unremovable) throw new Error(`cannot remove ${id}`);
    },
  };
  return probe;
}

/**
 * An env whose figma calls are recorded rather than performed. `log` is what
 * makes the ordering claims assertable: sweeping has to happen before the probe
 * exists, not merely somewhere in the call.
 */
function fakeEnv(strays: FakeProbe[] = []) {
  const probe = makeProbe("probe");
  const log: string[] = [];
  return {
    probe,
    log,
    env: {
      create: () => {
        log.push("create");
        return probe;
      },
      prepare: (p: FakeProbe) => {
        log.push("prepare");
        p.prepared += 1;
      },
      strayProbes: () => {
        log.push("sweep");
        return strays;
      },
    },
  };
}

describe("withProbeFrame", () => {
  it("prepares the probe, runs the work, then removes it", async () => {
    const { probe, env, log } = fakeEnv();

    const result = await withProbeFrame(env, async (p) => {
      log.push("use");
      expect(p).toBe(probe);
      expect(probe.prepared).toBe(1);
      expect(probe.removed).toBe(0);
      return "resolved";
    });

    expect(result).toBe("resolved");
    expect(probe.removed).toBe(1);
    // Sweeping is deliberately absent: it is a per-run concern, not a per-probe
    // one, and burying it in the lifecycle meant every early return in
    // probeThemeResolution skipped the cleanup entirely. See sweepStrayProbes.
    expect(log).toEqual(["create", "prepare", "use"]);
  });

  // The path that could not be tested before, and the reason #131 was filed: the
  // only way to exercise it was to ship a deliberately broken build.
  it("removes the probe when the work throws, and lets the error through", async () => {
    const { probe, env } = fakeEnv();
    const boom = new Error("resolveForConsumer blew up mid-mode");

    await expect(
      withProbeFrame(env, async () => {
        throw boom;
      }),
    ).rejects.toBe(boom);

    expect(probe.removed).toBe(1);
  });

  // Preparation is inside the try precisely so this holds: a frame that failed
  // half-way through being configured is still a frame in the user's file.
  it("removes the probe when preparing it throws", async () => {
    const { probe, env } = fakeEnv();
    env.prepare = () => {
      throw new Error("appendChild failed");
    };

    await expect(
      withProbeFrame(env, async () => "unreachable"),
    ).rejects.toThrow("appendChild failed");

    expect(probe.removed).toBe(1);
  });
});

describe("probe ownership", () => {
  // Matching on the name alone was destructive: it could not tell our probe from
  // a designer's frame that happened to carry the name, and would delete theirs.
  // Plugin data can, because Figma namespaces it to this plugin - nobody else can
  // write it, by accident or otherwise.
  it("recognises a probe this plugin marked", () => {
    const node = fakeNode();
    markProbe(node);
    expect(isStrayProbe(node)).toBe(true);
  });

  it("leaves a designer's frame alone even when it carries the probe name", () => {
    // The exact false positive the old name match would have deleted.
    expect(isStrayProbe(fakeNode("FRAME", PROBE_NAME))).toBe(false);
  });

  it("ignores an unmarked frame", () => {
    expect(isStrayProbe(fakeNode("FRAME", "Button"))).toBe(false);
  });

  // #121 claims a frame the moment it creates one, so a sandbox killed mid-build
  // leaves something reclaimable, and releases it only once the frame is
  // deliberately kept on the canvas. Without the release, the next run's sweep
  // would delete the evidence it just drew.
  it("releases a node that is deliberately kept", () => {
    const node = fakeNode();
    markProbe(node);
    expect(isStrayProbe(node)).toBe(true);

    unmarkProbe(node);
    expect(isStrayProbe(node)).toBe(false);
  });

  it("ignores a marked node that is not a frame", () => {
    const node = fakeNode("COMPONENT_SET");
    markProbe(node);
    expect(isStrayProbe(node)).toBe(false);
  });
});

describe("sweepStrayProbes", () => {
  // Cleanup for the case no `finally` can reach: if the sandbox is torn down
  // rather than unwound - which is what cancelling a plugin may do - teardown
  // never runs and the probe is orphaned. Nothing inside the plugin can prevent
  // that, so the next run clears the last one's residue.
  it("removes every stray it is given", () => {
    const orphans = [makeProbe("orphan-1"), makeProbe("orphan-2")];
    sweepStrayProbes({ strayProbes: () => orphans });
    expect(orphans.map((o) => o.removed)).toEqual([1, 1]);
  });

  // Cleaning up the last run's mess must never break this one. A stray that
  // cannot be removed is exactly the state a killed sandbox leaves behind, since
  // Figma throws on member access of a removed node.
  it("survives a stray it cannot remove, and sweeps the rest anyway", () => {
    const orphans = [
      makeProbe("unremovable", true),
      makeProbe("removable-after"),
    ];
    expect(() =>
      sweepStrayProbes({ strayProbes: () => orphans }),
    ).not.toThrow();
    expect(orphans[1].removed).toBe(1);
  });

  // Discovery can throw too: reading the page's children, or plugin data off a
  // node that has since been removed. "Never allowed to fail the call" has to
  // cover finding the strays, not only removing them.
  it("survives being unable to discover strays at all", () => {
    expect(() =>
      sweepStrayProbes({
        strayProbes: () => {
          throw new Error("cannot read page children");
        },
      }),
    ).not.toThrow();
  });

  it("does nothing when the page is clean", () => {
    expect(() => sweepStrayProbes({ strayProbes: () => [] })).not.toThrow();
  });
});

describe("probeThemeResolution", () => {
  /** A set that binds no variables, so the run returns before building a probe. */
  const UNBOUND: ComponentSetSnapshot = {
    id: "1:1",
    name: "Divider",
    type: "COMPONENT_SET",
    description: "",
    propertyNames: [],
    properties: [],
    variants: [
      {
        id: "1:2",
        name: "size=s",
        variantProperties: { size: "s" },
        tree: {
          id: "1:2",
          name: "size=s",
          type: "COMPONENT",
          visible: true,
          width: 8,
          height: 1,
          children: [],
        },
      },
    ],
  };

  // The wiring, not the sweep itself. Cleanup has to happen on every run that
  // gets this far, including the ones that never build a probe - otherwise a
  // page's orphan waits for a run that happens to need theme modes, and the
  // cancellation guarantee is back to resting on reading the code (#131).
  it("sweeps before returning early on a set that binds nothing", async () => {
    let swept = 0;

    const result = await probeThemeResolution(UNBOUND, () => {
      swept += 1;
    });

    // Establish that this really is the early-return path, so the assertion below
    // is about a run that never reached the probe lifecycle at all.
    expect(result).toBeUndefined();
    expect(swept).toBe(1);
  });
});

describe("partitionLookedUpVariables", () => {
  /** Only the field the partition reads; the real Variable is far wider. */
  const variable = (name: string) => ({ name }) as unknown as Variable;

  it("keeps the resolved variables, in the order they were looked up", () => {
    const looked = new Map([
      ["a", variable("A")],
      ["b", variable("B")],
    ]);

    const { variables } = partitionLookedUpVariables(looked, new Set());

    expect([...variables.keys()]).toEqual(["a", "b"]);
  });

  it("reports a dead direct binding, so the check has something to fail on", () => {
    // The broken-chain case #17 exists to catch: a deleted variable, or a remote
    // one whose library is unavailable. Dropping the id let a set with one
    // broken binding report `pass` on the strength of its healthy ones.
    const looked = new Map([
      ["dead", null],
      ["alive", variable("A")],
    ]);

    const { variables, unavailable } = partitionLookedUpVariables(
      looked,
      new Set(),
    );

    expect(unavailable).toEqual(["dead"]);
    expect([...variables.keys()]).toEqual(["alive"]);
  });

  it("stays silent about a dead variable reached only through a style", () => {
    // A style's broken binding is not a defect of the component that applied the
    // style, so it must not become one of #17's findings.
    const looked = new Map([["dead", null]]);

    const { unavailable } = partitionLookedUpVariables(
      looked,
      new Set(["dead"]),
    );

    expect(unavailable).toEqual([]);
  });

  it("reports the dead bindings in lookup order", () => {
    // The ids reach a check that reports them. A set of findings that reorders
    // itself between runs on an unchanged component reads as churn.
    const looked = new Map([
      ["second", null],
      ["first", null],
    ]);

    expect(partitionLookedUpVariables(looked, new Set()).unavailable).toEqual([
      "second",
      "first",
    ]);
  });
});
