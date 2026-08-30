import { describe, expect, it } from "vitest";

import { clearManifest, readManifest, writeManifest } from "./collect";
import { PackManifest } from "./plan";

/**
 * A page's plugin-data store, which is all these three functions touch.
 *
 * Figma's own `setPluginData(key, "")` is how a key is removed, so the fake
 * keeps the empty string rather than deleting, and `getPluginData` returns ""
 * for a key never written - both matching the real API, since the point of
 * these tests is what happens at exactly that boundary.
 */
function fakePage(): PageNode {
  const data = new Map<string, string>();
  return {
    getPluginData: (key: string) => data.get(key) ?? "",
    setPluginData: (key: string, value: string) => {
      data.set(key, value);
    },
  } as unknown as PageNode;
}

const MANIFEST: PackManifest = {
  version: 1,
  packedAt: "2026-08-30T00:00:00.000Z",
  pages: [{ name: "Home" }, { name: "About" }],
};

describe("the packed record", () => {
  it("round-trips what a pack wrote", () => {
    const page = fakePage();
    writeManifest(page, MANIFEST);
    expect(readManifest(page)).toEqual(MANIFEST);
  });

  it("is absent before anything is packed", () => {
    expect(readManifest(fakePage())).toBeNull();
  });

  it("is forgotten by clearManifest, so a repack cannot inherit it", () => {
    // The defect this exists for: emptying the temporary page removes its
    // children and NOT its plugin data. A manifest surviving into the next pack
    // describes frames that no longer exist, and `planUnpack` accepts a manifest
    // whose length matches the frames it can see - so a repack producing the
    // same number of frames would restore them under the previous pack's page
    // names, silently.
    const page = fakePage();
    writeManifest(page, MANIFEST);
    clearManifest(page);
    expect(readManifest(page)).toBeNull();
  });

  it("reads as absent rather than throwing when the stored value is corrupt", () => {
    const page = fakePage();
    page.setPluginData("tcc:packManifest", "{not json");
    expect(readManifest(page)).toBeNull();
  });

  it("reads as absent when the stored value parses but is the wrong shape", () => {
    const page = fakePage();
    page.setPluginData("tcc:packManifest", JSON.stringify({ version: 1 }));
    expect(readManifest(page)).toBeNull();
  });
});
