import { describe, it, expect } from "vitest";
import { checkBundledServer } from "./server-drift.mjs";

describe("checkBundledServer", () => {
  it("reports missing when the installed tree has no server.cjs at all", () => {
    // The presence-only case #191 must not replace: a server that was never
    // copied in is a different problem from a stale one, and needs its own
    // wording so the two are not confused when read off a terminal.
    const problems = checkBundledServer({
      installedExists: false,
      referenceExists: true,
      installedBytes: null,
      referenceBytes: Buffer.from("built"),
    });

    expect(problems).toEqual([
      "missing from the installed tree: mcp/server.cjs (the bundled MCP server)",
    ]);
  });

  it("fails loudly, not silently, when there is nothing fresh to compare against", () => {
    // dist-plugin/ is the comparison target (see the reasoning comment in the
    // module this wraps). If nobody has run `npm run build:plugin` yet, the
    // honest answer is "cannot verify", not a silent skip that reads as a pass.
    const problems = checkBundledServer({
      installedExists: true,
      referenceExists: false,
      installedBytes: Buffer.from("whatever"),
      referenceBytes: null,
    });

    expect(problems).toEqual([
      "cannot verify mcp/server.cjs: no dist-plugin/tidy-ds/mcp/server.cjs to compare " +
        "against. Run `npm run build:plugin` first, then re-run verify:plugin.",
    ]);
  });

  it("reports drift when the installed server differs byte-for-byte from the fresh build", () => {
    // esbuild output is deterministic for the same source and options, so any
    // byte difference at an unchanged version is real staleness, not noise.
    const problems = checkBundledServer({
      installedExists: true,
      referenceExists: true,
      installedBytes: Buffer.from("old build"),
      referenceBytes: Buffer.from("new build"),
    });

    expect(problems).toEqual([
      "stale: mcp/server.cjs (installed copy differs from the dist-plugin/ build; " +
        "the plugin.json version matches, so this is content drift, not a version bump)",
    ]);
  });

  it("reports nothing when the installed server matches the fresh build byte-for-byte", () => {
    const problems = checkBundledServer({
      installedExists: true,
      referenceExists: true,
      installedBytes: Buffer.from("same build"),
      referenceBytes: Buffer.from("same build"),
    });

    expect(problems).toEqual([]);
  });
});
