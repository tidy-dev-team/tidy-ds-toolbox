import { describe, it, expect } from "vitest";
import { createCancellationToken } from "./cancellation";

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
