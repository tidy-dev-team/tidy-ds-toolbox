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
import { withProbeFrame } from "./theme-probe";

/** Stand-in for the probe frame, recording what the lifecycle did to it. */
function fakeProbe(id = "probe") {
  return { id, removed: 0, prepared: 0, remove: () => {} } as unknown as {
    id: string;
    removed: number;
    prepared: number;
    remove(): void;
  };
}

function makeProbe(id = "probe") {
  const probe = fakeProbe(id);
  probe.remove = () => {
    probe.removed += 1;
  };
  return probe;
}

/** An env whose figma calls are all recorded rather than performed. */
function fakeEnv(strays: ReturnType<typeof makeProbe>[] = []) {
  const probe = makeProbe();
  return {
    probe,
    created: 0,
    env: {
      create: () => {
        return probe;
      },
      prepare: (p: typeof probe) => {
        p.prepared += 1;
      },
      strays: () => strays,
    },
  };
}

describe("withProbeFrame", () => {
  it("removes the probe once the work is done, and returns its result", async () => {
    const { probe, env } = fakeEnv();

    const result = await withProbeFrame(env, async (p) => {
      // The work sees a prepared probe: named, sized and parented before use.
      expect(p).toBe(probe);
      expect(probe.prepared).toBe(1);
      expect(probe.removed).toBe(0);
      return "resolved";
    });

    expect(result).toBe("resolved");
    expect(probe.removed).toBe(1);
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

  // The third of the issue's acceptance criterion no `finally` can reach. If the
  // sandbox is torn down rather than unwound - which is what cancelling a plugin
  // may do - teardown never runs and the probe is orphaned. Nothing inside the
  // plugin can prevent that, so the next run cleans up after the last one.
  it("sweeps probes an earlier run left behind, before creating its own", async () => {
    const orphans = [makeProbe("orphan-1"), makeProbe("orphan-2")];
    const { probe, env } = fakeEnv(orphans);

    await withProbeFrame(env, async () => {
      // Swept before the work starts, so a run never resolves against a page
      // still holding a stale probe with pinned modes.
      expect(orphans.map((o) => o.removed)).toEqual([1, 1]);
      return null;
    });

    expect(probe.removed).toBe(1);
  });

  it("still removes its own probe when sweeping finds nothing", async () => {
    const { probe, env } = fakeEnv([]);
    await withProbeFrame(env, async () => null);
    expect(probe.removed).toBe(1);
  });
});
