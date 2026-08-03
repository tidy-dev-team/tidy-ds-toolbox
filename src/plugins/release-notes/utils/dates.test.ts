import { describe, it, expect } from "vitest";
import { formatCardDate, toIsoDay } from "./dates";

describe("toIsoDay", () => {
  it("keeps the day only", () => {
    expect(toIsoDay("2026-07-28T09:15:00.000Z")).toBe("2026-07-28");
  });

  it("is empty for an unparseable date rather than 'Invalid Date'", () => {
    expect(toIsoDay("not a date")).toBe("");
  });
});

describe("formatCardDate", () => {
  it("prints the human form of the day", () => {
    expect(formatCardDate("2026-07-28T09:15:00.000Z")).toBe("Jul 28, 2026");
  });

  it("is empty for an unparseable date", () => {
    expect(formatCardDate("not a date")).toBe("");
  });

  // The card prints the date, the CSV exports it and the grouping key buckets
  // by it. A timestamp near either end of the UTC day is what splits them if
  // the card reads in the viewer's timezone instead.
  it("names the same day the CSV does at both ends of the UTC day", () => {
    expect(formatCardDate("2026-07-28T23:59:00.000Z")).toBe("Jul 28, 2026");
    expect(toIsoDay("2026-07-28T23:59:00.000Z")).toBe("2026-07-28");

    expect(formatCardDate("2026-01-01T00:01:00.000Z")).toBe("Jan 01, 2026");
    expect(toIsoDay("2026-01-01T00:01:00.000Z")).toBe("2026-01-01");
  });
});
