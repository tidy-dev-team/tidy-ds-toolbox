import { describe, it, expect, vi } from "vitest";
import { saveSprint } from "./sprintHelpers";
import type { Sprint } from "../types";

function fakeFigma(setSharedPluginData: (...args: unknown[]) => void) {
  return {
    root: { setSharedPluginData },
  } as unknown as PluginAPI;
}

const sprint: Sprint = { id: "abc-1", name: "Sprint 1", notes: [] };

describe("saveSprint", () => {
  it("reports success on a normal write", () => {
    const figma = fakeFigma(vi.fn());
    expect(saveSprint(figma, sprint)).toEqual({ success: true });
  });

  it("names the sprint and the reason on a size-limit failure", () => {
    const figma = fakeFigma(() => {
      throw new Error("Value exceeds the maximum allowed size for a key");
    });

    const result = saveSprint(figma, sprint);
    expect(result).toEqual({
      success: false,
      sprintId: "abc-1",
      reason: "too-large",
      message: `"Sprint 1" was not saved: it has grown too large to store. Remove some notes and try again.`,
    });
  });

  it("names the sprint on any other write failure, without claiming a size limit", () => {
    const figma = fakeFigma(() => {
      throw new Error("Something else went wrong");
    });

    const result = saveSprint(figma, sprint);
    expect(result).toEqual({
      success: false,
      sprintId: "abc-1",
      reason: "write-failed",
      message: `"Sprint 1" was not saved: Something else went wrong`,
    });
  });

  it("never throws out of the write path", () => {
    const figma = fakeFigma(() => {
      throw "a non-Error thrown value";
    });

    expect(() => saveSprint(figma, sprint)).not.toThrow();
  });
});
