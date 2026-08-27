import { describe, it, expect } from "vitest";
import {
  createCancellationGate,
  createCancellationToken,
  runUntilCancelled,
} from "./cancellation";

describe("createCancellationToken", () => {
  it("starts not cancelled", () => {
    const token = createCancellationToken();
    expect(token.isCancelled).toBe(false);
  });

  it("reports cancelled once cancel() is called", () => {
    const token = createCancellationToken();
    token.cancel();
    expect(token.isCancelled).toBe(true);
  });

  it("stays cancelled if cancel() is called more than once", () => {
    const token = createCancellationToken();
    token.cancel();
    token.cancel();
    expect(token.isCancelled).toBe(true);
  });

  it("a loop driven through a cancelled token stops early", () => {
    const token = createCancellationToken();
    const items = [1, 2, 3, 4, 5];
    const processed: number[] = [];

    for (const item of items) {
      if (token.isCancelled) break;
      processed.push(item);
      if (item === 2) {
        token.cancel();
      }
    }

    expect(processed).toEqual([1, 2]);
  });

  it("a loop driven through a fresh, never-cancelled token runs to completion", () => {
    const token = createCancellationToken();
    const items = [1, 2, 3];
    const processed: number[] = [];

    for (const item of items) {
      if (token.isCancelled) break;
      processed.push(item);
    }

    expect(processed).toEqual(items);
  });
});

describe("runUntilCancelled", () => {
  it("does no work at all when the token is already cancelled", async () => {
    const token = createCancellationToken();
    token.cancel();
    const done: string[] = [];

    const result = await runUntilCancelled(
      ["Cover", "Buttons", "Tabs"],
      async (name) => {
        done.push(name);
        return name;
      },
      token,
    );

    // The cancellation and the start can cross, and when they do the honest
    // outcome is an untouched file rather than one page nobody asked for.
    expect(done).toEqual([]);
    expect(result).toEqual({ completed: [], cancelled: true });
  });

  it("observes a cancellation that arrives while the run is already going", async () => {
    const token = createCancellationToken();
    const done: number[] = [];
    // Queued the way an incoming Bridge message is - as a macrotask, behind
    // whatever the loop is doing. This is the case the yield exists for: a
    // loop that only awaits its own work never lets this callback run, so the
    // token is never seen cancelled and the run finishes as if nobody asked.
    setTimeout(() => token.cancel(), 0);

    const result = await runUntilCancelled(
      Array.from({ length: 50 }, (_unused, i) => i),
      async (n) => {
        done.push(n);
        return n;
      },
      token,
    );

    expect(result.cancelled).toBe(true);
    expect(done.length).toBeGreaterThan(0);
    expect(done.length).toBeLessThan(50);
    expect(result.completed).toEqual(done);
  });

  it("stops at the next boundary and keeps every item it had finished", async () => {
    const token = createCancellationToken();
    const done: string[] = [];

    const result = await runUntilCancelled(
      ["Cover", "Buttons", "Tabs", "Toast", "Tooltips"],
      async (name) => {
        done.push(name);
        if (name === "Buttons") token.cancel();
        return name;
      },
      token,
    );

    // Buttons is finished, not abandoned half way - the token is read between
    // whole items. What was built stays built; nothing is undone.
    expect(done).toEqual(["Cover", "Buttons"]);
    expect(result).toEqual({
      completed: ["Cover", "Buttons"],
      cancelled: true,
    });
  });

  it("covers every item and says so when nothing ever cancels it", async () => {
    const token = createCancellationToken();
    const items = ["Cover", "Buttons", "Tabs"];

    const result = await runUntilCancelled(items, async (n) => n, token);

    // The uncancelled run is the common one and must be untouched by all of
    // the above: everything stamped, and no claim that anything stopped.
    expect(result).toEqual({ completed: items, cancelled: false });
  });
});

describe("createCancellationGate", () => {
  // A fake yield that records how often it was asked for, so a test can assert
  // the gate yields per batch rather than per item.
  function fakeYield(): { yields: number; fn: () => Promise<void> } {
    const state = { yields: 0, fn: async () => {} };
    state.fn = async () => {
      state.yields += 1;
    };
    return state;
  }

  it("yields once per batch, not once per item", async () => {
    const token = createCancellationToken();
    const y = fakeYield();
    const gate = createCancellationGate(token, 4, y.fn);
    for (let i = 0; i < 12; i++) await gate.step();
    expect(y.yields).toBe(3);
  });

  it("never yields when the batch size is not reached", async () => {
    const token = createCancellationToken();
    const y = fakeYield();
    const gate = createCancellationGate(token, 100, y.fn);
    for (let i = 0; i < 99; i++) await gate.step();
    expect(y.yields).toBe(0);
  });

  it("reports stop as soon as the token is cancelled, batch or not", async () => {
    const token = createCancellationToken();
    const gate = createCancellationGate(token, 1000, async () => {});
    expect(await gate.step()).toBe(false);
    token.cancel();
    expect(await gate.step()).toBe(true);
  });

  it("reads the token after the yield, so a cancellation that the yield delivered is seen at once", async () => {
    const token = createCancellationToken();
    // Stands in for the "cancel-scan" message the yield gives a turn to.
    const gate = createCancellationGate(token, 2, async () => {
      token.cancel();
    });
    expect(await gate.step()).toBe(false);
    expect(await gate.step()).toBe(true);
  });

  it("keeps reporting stop once cancelled", async () => {
    const token = createCancellationToken();
    const gate = createCancellationGate(token, 1000, async () => {});
    token.cancel();
    expect(await gate.step()).toBe(true);
    expect(await gate.step()).toBe(true);
  });

  it("treats a batch size below one as every item, rather than dividing by it", async () => {
    const token = createCancellationToken();
    const y = fakeYield();
    const gate = createCancellationGate(token, 0, y.fn);
    for (let i = 0; i < 3; i++) await gate.step();
    expect(y.yields).toBe(3);
  });
});
