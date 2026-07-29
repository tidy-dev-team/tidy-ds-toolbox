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
import { PROBE_NAME, isStrayProbe, withProbeFrame } from "./theme-probe";

interface FakeProbe {
  id: string;
  removed: number;
  prepared: number;
  remove(): void;
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
    // Sweeping precedes creation, so a run never resolves against a page that
    // still holds a stale probe with pinned modes. Asserted on the order rather
    // than from inside the callback, which cannot tell the two apart.
    expect(log).toEqual(["sweep", "create", "prepare", "use"]);
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

  // The third case in the issue's acceptance criterion, which no `finally` can
  // reach. If the sandbox is torn down rather than unwound - which is what
  // cancelling a plugin may do - teardown never runs and the probe is orphaned.
  // Nothing inside the plugin can prevent that, so the next run cleans up after
  // the last one.
  it("sweeps probes an earlier run left behind", async () => {
    const orphans = [makeProbe("orphan-1"), makeProbe("orphan-2")];
    const { probe, env } = fakeEnv(orphans);

    await withProbeFrame(env, async () => null);

    expect(orphans.map((o) => o.removed)).toEqual([1, 1]);
    expect(probe.removed).toBe(1);
  });

  // Cleaning up the last run's mess must never break this one. The sweep is a
  // courtesy, and a stray that cannot be removed is exactly the state a killed
  // sandbox leaves behind, so failing here would turn litter into a broken
  // read-only query.
  it("survives a stray it cannot remove, and sweeps the rest anyway", async () => {
    const orphans = [
      makeProbe("unremovable", true),
      makeProbe("removable-after"),
    ];
    const { probe, env } = fakeEnv(orphans);

    const result = await withProbeFrame(env, async () => "ran anyway");

    expect(result).toBe("ran anyway");
    // The throwing stray did not abort the loop before the next one.
    expect(orphans[1].removed).toBe(1);
    expect(probe.removed).toBe(1);
  });
});

describe("isStrayProbe", () => {
  // The predicate the real env filters on. Pure, so the one branch the injected
  // env would otherwise hide is testable - including the documented hazard that
  // it matches on a name a designer could in principle also use.
  it("matches an invisible probe frame by name", () => {
    expect(isStrayProbe({ type: "FRAME", name: PROBE_NAME })).toBe(true);
  });

  it("ignores frames that are not probes", () => {
    expect(isStrayProbe({ type: "FRAME", name: "Button" })).toBe(false);
    expect(isStrayProbe({ type: "FRAME", name: `${PROBE_NAME}-old` })).toBe(
      false,
    );
  });

  it("ignores non-frames, whatever they are called", () => {
    // The probe is always a frame, so a component set someone named this is
    // somebody else's node and must survive.
    expect(isStrayProbe({ type: "COMPONENT_SET", name: PROBE_NAME })).toBe(
      false,
    );
  });
});
