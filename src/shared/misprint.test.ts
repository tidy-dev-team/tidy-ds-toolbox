import { describe, it, expect } from "vitest";
import {
  MISPRINT_MARKER,
  createMisprintText,
  parseMisprintMarker,
} from "./misprint";

describe("createMisprintText", () => {
  it("scrambles the name via the Hebrew keyboard map", () => {
    // a→ש b→נ c→ב per keyboardsMap; unmapped chars pass through.
    expect(createMisprintText("abc")).toBe(`${MISPRINT_MARKER} שנב`);
  });

  it("leaves characters with no mapping unchanged", () => {
    expect(createMisprintText("Button 1")).toBe(
      `${MISPRINT_MARKER} נואאםמ 1`,
    );
  });
});

describe("parseMisprintMarker — presence (tolerant)", () => {
  const expected = "Button"; // scramble: נואאםמ

  it("detects the canonical writer format", () => {
    const r = parseMisprintMarker(createMisprintText("Button"), expected);
    expect(r.present).toBe(true);
    expect(r.correct).toBe(true);
  });

  it("detects the marker among other lines", () => {
    const desc = `Some notes.\nAlso known as: Btn\n${createMisprintText("Button")}\ntrailing`;
    expect(parseMisprintMarker(desc, expected).present).toBe(true);
  });

  it("is case-insensitive on the 'misprint:' label", () => {
    expect(
      parseMisprintMarker("Misprint: נואאםמ", expected).present,
    ).toBe(true);
    expect(
      parseMisprintMarker("---- MISPRINT: נואאםמ", expected).present,
    ).toBe(true);
  });

  it("tolerates dash-prefix variance (fewer/more/no dashes)", () => {
    expect(parseMisprintMarker("misprint: נואאםמ", expected).present).toBe(
      true,
    );
    expect(
      parseMisprintMarker("-- misprint: נואאםמ", expected).present,
    ).toBe(true);
    expect(
      parseMisprintMarker(
        "---------- misprint: נואאםמ",
        expected,
      ).present,
    ).toBe(true);
  });

  it("returns present:false when no marker exists", () => {
    const r = parseMisprintMarker("Just some notes.", expected);
    expect(r).toEqual({ present: false, correct: false });
  });
});

describe("parseMisprintMarker — correctness (strict on payload)", () => {
  it("correct:true when payload matches the current name", () => {
    const r = parseMisprintMarker(createMisprintText("Button"), "Button");
    expect(r).toMatchObject({ present: true, correct: true });
  });

  it("correct:false when the payload is stale (name renamed)", () => {
    // Marker written for the old name "Btn", node is now "Button".
    const r = parseMisprintMarker(createMisprintText("Btn"), "Button");
    expect(r.present).toBe(true);
    expect(r.correct).toBe(false);
    expect(r.actual).toBe("נאמ"); // scramble of "Btn"
    expect(r.expected).toBe("נואאםמ"); // scramble of "Button"
  });

  it("correct:false when the payload is hand-edited / wrong", () => {
    const r = parseMisprintMarker(
      `${MISPRINT_MARKER} zzz`,
      "Button",
    );
    expect(r).toMatchObject({
      present: true,
      correct: false,
      actual: "zzz",
      expected: "נואאםמ",
    });
  });

  it("ignores trailing whitespace when comparing payloads", () => {
    const r = parseMisprintMarker(
      `${MISPRINT_MARKER} נואאםמ   `,
      "Button",
    );
    expect(r.correct).toBe(true);
  });
});
