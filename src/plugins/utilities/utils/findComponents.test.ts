import { describe, expect, it } from "vitest";
import { OperationError } from "../../../shared/operations/errors";
import {
  DEFAULT_FIND_LIMIT,
  MAX_FIND_LIMIT,
  selectComponents,
} from "./findComponents";

const ref = (n: number) => ({ id: `1:${n}`, name: `Component ${n}` });
const many = (n: number) => Array.from({ length: n }, (_, i) => ref(i));

describe("selectComponents", () => {
  it("returns everything when the candidate list is under the limit", () => {
    const result = selectComponents(many(3), {});
    expect(result.components).toHaveLength(3);
    expect(result.total).toBe(3);
    expect(result.truncated).toBe(false);
    expect(result.omitted).toBe(0);
  });

  it("filters by name glob before counting", () => {
    const result = selectComponents(
      [
        { id: "1:1", name: "Btn/Primary" },
        { id: "1:2", name: "Btn/Secondary" },
        { id: "1:3", name: "Card" },
      ],
      { namePattern: "Btn*" },
    );
    expect(result.components.map((c) => c.id)).toEqual(["1:1", "1:2"]);
    expect(result.total).toBe(2);
  });

  it("caps the returned list at the default limit and says so", () => {
    const result = selectComponents(many(DEFAULT_FIND_LIMIT + 41), {});
    expect(result.components).toHaveLength(DEFAULT_FIND_LIMIT);
    expect(result.total).toBe(DEFAULT_FIND_LIMIT + 41);
    expect(result.truncated).toBe(true);
    expect(result.omitted).toBe(41);
    expect(result.limit).toBe(DEFAULT_FIND_LIMIT);
  });

  // Silent truncation would be worse than the timeout this cap replaces (#128):
  // the agent must be able to tell a complete answer from a partial one.
  it("names the omitted count and the levers in the summary when truncated", () => {
    const { summary } = selectComponents(many(841), { limit: 200 });
    expect(summary).toContain("200");
    expect(summary).toContain("841");
    expect(summary).toContain("641");
    expect(summary).toMatch(/namePattern/);
    expect(summary).toMatch(/tidy_file_list_pages/);
  });

  it("does not mention truncation when nothing was dropped", () => {
    const { summary } = selectComponents(many(3), {});
    expect(summary).toBe("3 component(s) matched");
    expect(summary).not.toMatch(/omitted/);
  });

  it("keeps the first N candidates in their original order", () => {
    const result = selectComponents(many(5), { limit: 2 });
    expect(result.components.map((c) => c.id)).toEqual(["1:0", "1:1"]);
  });

  it("counts a pattern that matches nothing as an empty, untruncated result", () => {
    const result = selectComponents(many(5), { namePattern: "Nope*" });
    expect(result.components).toEqual([]);
    expect(result.total).toBe(0);
    expect(result.truncated).toBe(false);
    expect(result.summary).toBe("0 component(s) matched");
  });

  it("honours an explicit limit up to the ceiling", () => {
    expect(
      selectComponents(many(20), { limit: MAX_FIND_LIMIT }).components,
    ).toHaveLength(20);
  });

  it("rejects a limit above the ceiling", () => {
    expect(() =>
      selectComponents(many(1), { limit: MAX_FIND_LIMIT + 1 }),
    ).toThrow(OperationError);
  });

  it("rejects a non-positive or fractional limit", () => {
    expect(() => selectComponents(many(1), { limit: 0 })).toThrow(
      OperationError,
    );
    expect(() => selectComponents(many(1), { limit: -5 })).toThrow(
      OperationError,
    );
    expect(() => selectComponents(many(1), { limit: 1.5 })).toThrow(
      OperationError,
    );
  });
});
