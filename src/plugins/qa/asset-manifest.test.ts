import { describe, it, expect } from "vitest";
import {
  isDeprecatedPage,
  isManifestGenerated,
  normalizeManifest,
} from "./asset-manifest";

describe("isDeprecatedPage", () => {
  it("matches the words that mean do-not-use", () => {
    for (const page of [
      "Deprecated",
      "Icons (deprecated)",
      "Legacy icons",
      "LEGACY",
      "Archive",
      "Archives",
      "Archived assets",
      "Obsolete logos",
    ]) {
      expect(isDeprecatedPage(page)).toBe(true);
    }
  });

  it("leaves current pages alone", () => {
    // A false positive here turns a legitimate asset into a hard `fail`, so the
    // rule has to stay narrow: whole words only, and nothing that merely
    // contains one.
    for (const page of [
      "Icons / Core",
      "Iconography",
      "Illustrations",
      "Logos",
      "Foundations",
      "Archivist tools",
      "Legacies",
    ]) {
      expect(isDeprecatedPage(page)).toBe(false);
    }
  });
});

describe("normalizeManifest", () => {
  const entry = { name: "Size=24", page: "Icons / Core", set: "Icon" };

  it("reads a well-formed manifest", () => {
    const manifest = normalizeManifest({
      generatedAt: "2026-07-28",
      source: { fileKey: "abc", fileName: "Foundations" },
      components: { k1: entry },
    });
    expect(manifest.generatedAt).toBe("2026-07-28");
    expect(manifest.source).toEqual({
      fileKey: "abc",
      fileName: "Foundations",
    });
    expect(manifest.components.k1).toEqual(entry);
    expect(isManifestGenerated(manifest)).toBe(true);
  });

  it("degrades to ungenerated rather than throwing on junk", () => {
    // The file is generated, so a truncated or half-written one has to fall back
    // to "no manifest" instead of taking the whole QA run down from inside a
    // check.
    for (const junk of [null, undefined, 42, "{}", [], {}]) {
      const manifest = normalizeManifest(junk);
      expect(isManifestGenerated(manifest)).toBe(false);
      expect(manifest.generatedAt).toBeNull();
    }
  });

  it("treats a dated but empty manifest as ungenerated", () => {
    // A generation that produced nothing must not read as "Foundations publishes
    // nothing", which would report every asset in the file as unapproved.
    const manifest = normalizeManifest({
      generatedAt: "2026-07-28",
      source: { fileKey: "abc", fileName: "Foundations" },
      components: {},
    });
    expect(isManifestGenerated(manifest)).toBe(false);
    expect(manifest.generatedAt).toBeNull();
  });

  it("drops individual entries that are missing a name or page", () => {
    const manifest = normalizeManifest({
      generatedAt: "2026-07-28",
      components: {
        good: entry,
        noPage: { name: "Size=24" },
        noName: { page: "Icons / Core" },
        notAnObject: "nope",
      },
    });
    expect(Object.keys(manifest.components)).toEqual(["good"]);
  });

  it("keeps a usable manifest when only the source is malformed", () => {
    // The source is for display on the row; losing it must not cost the keys.
    const manifest = normalizeManifest({
      generatedAt: "2026-07-28",
      source: { fileKey: "abc" },
      components: { k1: entry },
    });
    expect(manifest.source).toBeNull();
    expect(isManifestGenerated(manifest)).toBe(true);
  });
});
