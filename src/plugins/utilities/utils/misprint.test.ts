// The misprint apply's stop behaviour (#185).
//
// The run has two halves with opposite rules, and both decisions are pinned
// here. Validation looks each id up one at a time and stops cleanly when asked
// - nothing has been written yet, so stopping costs nothing. Writing is
// deliberately NOT stoppable: the Operation's summary promises that a run
// failing validation leaves every component untouched, and a stop part way
// through the writing would break that promise. The refusal is structural -
// the write loop takes no token, so there is no checkpoint to miss - and the
// test below pins the observable half of that: a token cancelled before the
// writing begins does not stop it.

import { describe, it, expect } from "vitest";
import {
  resolveMisprintTargets,
  applyMisprintDescriptions,
  describeStoppedMisprintApply,
} from "./misprint";
import { createCancellationToken } from "../../../shared/cancellation";

/** A stand-in for a Figma node, carrying only what the rules read. */
function fakeComponent(id: string, name = `Component ${id}`) {
  return {
    id,
    name,
    type: "COMPONENT" as const,
    descriptionMarkdown: "",
  };
}

describe("resolveMisprintTargets", () => {
  const ids = ["1:1", "1:2", "1:3", "1:4"];

  function fakeLookup(
    nodes: Record<string, { type: string; name: string; id: string } | null>,
  ) {
    const calls: string[] = [];
    return {
      calls: () => calls,
      lookup: async (id: string) => {
        calls.push(id);
        return nodes[id] ?? null;
      },
    };
  }

  it("resolves every id and reports nothing wrong", async () => {
    const { lookup } = fakeLookup({
      "1:1": fakeComponent("1:1"),
      "1:2": fakeComponent("1:2"),
      "1:3": fakeComponent("1:3"),
      "1:4": fakeComponent("1:4"),
    });

    const resolution = await resolveMisprintTargets(ids, lookup);

    expect(resolution.cancelled).toBe(false);
    expect(resolution.resolved.map((t) => t.id)).toEqual(ids);
    expect(resolution.missing).toEqual([]);
    expect(resolution.wrongType).toEqual([]);
  });

  it("sorts unresolvable ids into missing and wrong-type", async () => {
    const { lookup } = fakeLookup({
      "1:1": fakeComponent("1:1"),
      "1:2": null,
      "1:3": { id: "1:3", name: "A frame", type: "FRAME" },
      "1:4": fakeComponent("1:4"),
    });

    const resolution = await resolveMisprintTargets(ids, lookup);

    expect(resolution.resolved.map((t) => t.id)).toEqual(["1:1", "1:4"]);
    expect(resolution.missing).toEqual(["1:2"]);
    expect(resolution.wrongType).toEqual(["1:3"]);
  });

  it("stops between lookups when cancelled, before anything is written", async () => {
    const { lookup, calls } = fakeLookup({
      "1:1": fakeComponent("1:1"),
      "1:2": fakeComponent("1:2"),
      "1:3": fakeComponent("1:3"),
      "1:4": fakeComponent("1:4"),
    });
    // Cancels once the first lookup has come back, standing in for a stop
    // request arriving while validation is running.
    const token = {
      get isCancelled() {
        return calls().length >= 1;
      },
      cancel() {},
    };

    const resolution = await resolveMisprintTargets(ids, lookup, token);

    expect(resolution.cancelled).toBe(true);
    expect(calls().length).toBeLessThan(ids.length);
    expect(resolution.resolved.length).toBeLessThan(ids.length);
  });

  it("does not report a stop when it validated everything", async () => {
    const { lookup } = fakeLookup({ "1:1": fakeComponent("1:1") });

    const resolution = await resolveMisprintTargets(["1:1"], lookup);

    expect(resolution.cancelled).toBe(false);
  });
});

describe("applyMisprintDescriptions", () => {
  function fakeWritable(id: string, name = `Component ${id}`) {
    return fakeComponent(id, name);
  }

  it("writes every resolved component and names the ones without aliases", () => {
    const withAliases = fakeWritable("1:1", "Buttons");
    const withoutAliases = fakeWritable("1:2", "Totally Unknown Thing");
    const written: string[] = [];

    const outcome = applyMisprintDescriptions(
      [
        { id: "1:1", node: withAliases },
        { id: "1:2", node: withoutAliases },
      ],
      (node) => {
        written.push(node.name);
        node.descriptionMarkdown = "written";
        return { aliases: node.name === "Buttons" ? ["Btns"] : [] };
      },
    );

    expect(outcome.updated).toBe(2);
    expect(outcome.ids).toEqual(["1:1", "1:2"]);
    expect(outcome.withoutAliases).toEqual(["Totally Unknown Thing"]);
    expect(withAliases.descriptionMarkdown).toBe("written");
    expect(withoutAliases.descriptionMarkdown).toBe("written");
    expect(written).toEqual(["Buttons", "Totally Unknown Thing"]);
  });

  it("is not stoppable: a cancelled token does not hold the writing back", () => {
    // The decision under test. Validation can stop, because stopping it
    // writes nothing; writing cannot, because a partial write is the one
    // outcome the Operation's summary promises can never happen. The loop
    // takes no token at all - this cancel is a stand-in for one that arrived
    // while the writing was under way.
    const token = createCancellationToken();
    token.cancel();

    const nodes = [
      fakeWritable("1:1"),
      fakeWritable("1:2"),
      fakeWritable("1:3"),
    ];
    const outcome = applyMisprintDescriptions(
      nodes.map((node) => ({ id: node.id, node })),
      (node) => {
        node.descriptionMarkdown = "written";
        return { aliases: ["x"] };
      },
    );

    expect(outcome.updated).toBe(3);
    expect(nodes.every((node) => node.descriptionMarkdown === "written")).toBe(
      true,
    );
  });
});

describe("describeStoppedMisprintApply", () => {
  it("says nothing was written and that re-running is safe", () => {
    const message = describeStoppedMisprintApply();

    expect(message).toMatch(/nothing was written/i);
    // The Operation is idempotent, so the instinctive re-run is the right
    // answer here - the message should say so rather than leave it guessed.
    expect(message).toMatch(/again|re-run/i);
  });
});
