import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, it, expect } from "vitest";

/**
 * Guards against #158: the README stated that `manifest.json` grants no network
 * access (`allowedDomains: ["none"]`) while the manifest actually granted one
 * origin, the analytics ingest endpoint. That is a false privacy claim, it stood
 * twenty lines above a paragraph in the same README stating the truth, and the
 * deploy script copies that README into every distributed package - so the wrong
 * claim shipped.
 *
 * The check is mechanical because the fact is: both files are committed, and a
 * privacy claim that can rot silently is the one worth pinning.
 *
 * It deliberately does not bless one sentence and match it, which would only
 * move the rot to the next sentence. It holds the README to the manifest in two
 * directions instead - every granted origin is named somewhere in the prose, and
 * every `allowedDomains` list the prose quotes says what the manifest says.
 */

const ROOT_DIR = path.join(__dirname, "..", "..");

interface Manifest {
  networkAccess?: {
    allowedDomains?: string[];
    devAllowedDomains?: string[];
  };
}

function readManifest(): Manifest {
  const raw = readFileSync(path.join(ROOT_DIR, "manifest.json"), "utf-8");
  return JSON.parse(raw) as Manifest;
}

function readReadme(): string {
  return readFileSync(path.join(ROOT_DIR, "README.md"), "utf-8");
}

/**
 * Every `allowedDomains: [...]` the README quotes, as the list of origins each
 * one claims. Figma's sentinel for "no network at all" is the single entry
 * "none", so a README quoting that while the manifest grants a real origin is
 * making the exact claim #158 found.
 */
function quotedAllowedDomains(readme: string): string[][] {
  const pattern = /allowedDomains"?\s*:\s*\[([^\]]*)\]/g;
  return [...readme.matchAll(pattern)].map((match) =>
    [...match[1].matchAll(/"([^"]*)"/g)].map((entry) => entry[1]),
  );
}

describe("manifest.json and README.md agree about network access", () => {
  it("names every origin the manifest grants", () => {
    const granted = readManifest().networkAccess?.allowedDomains ?? [];
    const readme = readReadme();

    for (const domain of granted) {
      if (domain === "none") continue;
      expect(
        readme.includes(domain),
        `README.md does not name the granted origin "${domain}"`,
      ).toBe(true);
    }
  });

  it("quotes no allowedDomains list that disagrees with the manifest", () => {
    const network = readManifest().networkAccess;
    const granted = network?.allowedDomains ?? [];
    // The README quotes the dev list as well, and the pattern above matches
    // both. Either is a true statement, so a quoted list has to equal one of
    // them; anything else is prose that has drifted from the manifest.
    const dev = network?.devAllowedDomains ?? [];

    for (const quoted of quotedAllowedDomains(readReadme())) {
      const matches =
        JSON.stringify(quoted) === JSON.stringify(granted) ||
        JSON.stringify(quoted) === JSON.stringify(dev);
      expect(
        matches,
        `README.md quotes allowedDomains ${JSON.stringify(quoted)}, but the ` +
          `manifest grants ${JSON.stringify(granted)} in production and ` +
          `${JSON.stringify(dev)} in development`,
      ).toBe(true);
    }
  });

  it("would catch the claim #158 found, stated as data", () => {
    // The check above is only worth having if it fails on the original text,
    // so the original text is kept here rather than trusted to be covered.
    const original =
      'manifest.json has `networkAccess.allowedDomains: ["none"]` so ' +
      "production builds get no network";
    expect(quotedAllowedDomains(original)).toEqual([["none"]]);
    expect(
      JSON.stringify(["none"]) ===
        JSON.stringify(["https://toolbox-logs.wearekido.dev"]),
    ).toBe(false);
  });
});
