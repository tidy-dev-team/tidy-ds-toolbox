import { describe, it, expect } from "vitest";
import { statusStyle } from "./status-style";
import type { ItemStatus } from "../types";

const ALL_STATUSES: ItemStatus[] = [
  "pass",
  "warn",
  "fail",
  "not_applicable",
  "manual",
  "not_implemented",
  "not_run",
];

describe("statusStyle", () => {
  it("returns a non-empty label and a hex colour for every ItemStatus", () => {
    for (const status of ALL_STATUSES) {
      const style = statusStyle(status);
      expect(style.label.length).toBeGreaterThan(0);
      expect(style.hex).toMatch(/^#[0-9A-Fa-f]{6}$/);
    }
  });

  it("gives distinct labels to the actionable statuses", () => {
    const labels = new Set(
      (["pass", "warn", "fail", "manual"] as ItemStatus[]).map(
        (s) => statusStyle(s).label,
      ),
    );
    expect(labels.size).toBe(4);
  });

  it("distinguishes not_applicable from pass", () => {
    expect(statusStyle("not_applicable").label).not.toBe(
      statusStyle("pass").label,
    );
  });
});
