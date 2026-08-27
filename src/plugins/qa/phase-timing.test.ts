import { describe, it, expect } from "vitest";
import { createPhaseTimer } from "./phase-timing";

/** A clock the test advances by hand, so no assertion depends on real time. */
function clock(steps: number[]) {
  let i = 0;
  const marks = [0, ...steps];
  return () => marks[Math.min(i++, marks.length - 1)];
}

describe("createPhaseTimer", () => {
  it("returns the phase's own value untouched", async () => {
    const timer = createPhaseTimer(clock([5]));

    await expect(timer.phase("resolve", async () => "subject")).resolves.toBe(
      "subject",
    );
  });

  it("reports each phase in the order it ran, with a total", async () => {
    // 0 -> 10 resolve, 10 -> 110 snapshot, 110 -> 115 checks
    const timer = createPhaseTimer(clock([10, 10, 110, 110, 115]));

    await timer.phase("resolve", async () => null);
    await timer.phase("snapshot", async () => null);
    await timer.phase("checks", async () => null);

    expect(timer.summary()).toBe(
      "resolve 10ms, snapshot 100ms, checks 5ms (total 115ms)",
    );
  });

  it("times a phase that threw, then lets the error through", async () => {
    // A run that fails is exactly the run worth timing: the phase it died in is
    // the one to look at, and losing the timing to the throw hides it.
    const timer = createPhaseTimer(clock([40]));

    await expect(
      timer.phase("snapshot", async () => {
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");

    expect(timer.summary()).toBe("snapshot 40ms (failed) (total 40ms)");
  });

  it("says so rather than reporting an empty summary when nothing ran", () => {
    expect(createPhaseTimer(clock([])).summary()).toBe("no phases timed");
  });

  it("keeps two runs of the same phase name apart", async () => {
    const timer = createPhaseTimer(clock([1, 1, 3]));

    await timer.phase("draw", async () => null);
    await timer.phase("draw", async () => null);

    expect(timer.summary()).toBe("draw 1ms, draw 2ms (total 3ms)");
  });

  it("rounds a fractional duration to whole milliseconds", async () => {
    const timer = createPhaseTimer(clock([10.4]));

    await timer.phase("resolve", async () => null);

    expect(timer.summary()).toBe("resolve 10ms (total 10ms)");
  });
});

describe("createPhaseTimer with nested phases", () => {
  it("counts a nested phase once, not twice, in the total", async () => {
    // The canvas operation times the composition, and the composition times the
    // one document traversal inside it. Summing the phases would report a total
    // longer than the run actually took, which is worse than no total at all.
    let t = 0;
    const timer = createPhaseTimer(() => t);

    await timer.phase("compose", async () => {
      t = 10;
      await timer.phase("prior-artifacts", async () => {
        t = 90;
      });
      t = 100;
    });

    expect(timer.summary()).toBe(
      "prior-artifacts 80ms, compose 100ms (total 100ms)",
    );
  });
});
