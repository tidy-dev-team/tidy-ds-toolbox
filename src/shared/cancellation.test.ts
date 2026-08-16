import { describe, it, expect } from "vitest";
import { createCancellationToken, runUntilCancelled } from "./cancellation";

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
