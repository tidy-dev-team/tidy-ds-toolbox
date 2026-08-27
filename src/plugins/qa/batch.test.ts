import { describe, it, expect } from "vitest";
import { loadByIdInOrder } from "./batch";

describe("loadByIdInOrder", () => {
  it("asks for every unique id once, in first-appearance order", async () => {
    const asked: string[] = [];

    const loaded = await loadByIdInOrder(["b", "a", "b", "c"], async (id) => {
      asked.push(id);
      return id.toUpperCase();
    });

    expect(asked).toEqual(["b", "a", "c"]);
    expect([...loaded.keys()]).toEqual(["b", "a", "c"]);
    expect(loaded.get("a")).toBe("A");
  });

  it("issues the lookups together rather than one after another", async () => {
    // The whole point. Each of these is a sandbox round trip, and a component
    // set can bind hundreds of variables; awaited in turn they serialise into
    // the dominant cost of a QA read.
    let inFlight = 0;
    let peak = 0;

    await loadByIdInOrder(["a", "b", "c", "d"], async (id) => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await Promise.resolve();
      inFlight -= 1;
      return id;
    });

    expect(peak).toBe(4);
  });

  it("keeps an id whose lookup found nothing, with a null value", async () => {
    // A deleted variable, or a remote one whose library is unavailable. The id
    // has to survive: it is the broken-chain case the checks exist to catch,
    // and dropping it let a set with one dead binding report a pass on the
    // strength of its remaining healthy bindings.
    const loaded = await loadByIdInOrder(["a", "b"], async (id) =>
      id === "a" ? null : "B",
    );

    expect([...loaded.entries()]).toEqual([
      ["a", null],
      ["b", "B"],
    ]);
  });

  it("preserves order regardless of which lookup settles first", async () => {
    const loaded = await loadByIdInOrder(["slow", "fast"], async (id) => {
      if (id === "fast") return id;
      await Promise.resolve();
      await Promise.resolve();
      return id;
    });

    expect([...loaded.keys()]).toEqual(["slow", "fast"]);
  });

  it("answers an empty id list with an empty map", async () => {
    const loaded = await loadByIdInOrder([], async () => "never");

    expect(loaded.size).toBe(0);
  });
});

describe("loadByIdInOrder on a failing lookup", () => {
  it("lets the rejection through", async () => {
    // Same as when these were awaited in turn. The difference, stated in the
    // module doc, is that the other lookups have already been issued by then -
    // harmless while every one of them is a read.
    await expect(
      loadByIdInOrder(["a", "b"], async (id) => {
        if (id === "a") throw new Error("figma said no");
        return id;
      }),
    ).rejects.toThrow("figma said no");
  });
});
