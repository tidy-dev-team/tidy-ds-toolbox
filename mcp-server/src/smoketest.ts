// CI gate for the bundled MCP server.
//
// Spawns the *bundled* server (dist/server.cjs — the exact artifact designers
// run) as a subprocess, speaks MCP over its stdio, and asserts it starts and
// serves the operation catalogue. This catches bundling regressions: a missing
// dependency or broken `shared/operations` cross-import crashes on startup, and
// `listTools` forces the catalogue to register and serialize its zod schemas to
// JSON Schema — exercising zod end-to-end.
//
// It does NOT round-trip a real operation: that needs a connected Figma plugin
// over the Bridge and can't run headless. A true end-to-end operation test
// belongs in its own issue (build a plugin sim, exercise bridge + handlers).
//
// Run via `npm run mcp:smoketest`, which bundles first.

import { resolve } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { CATALOGUE } from "./catalogue.ts";

// Path to the bundled server is passed as the first arg (the npm script points
// it at dist/server.cjs). Resolving it here avoids import.meta / __dirname,
// which don't survive the same way through the CJS bundle.
const serverArg = process.argv[2];
if (!serverArg) {
  process.stderr.write(
    "smoketest: missing server bundle path argument (e.g. dist/server.cjs)\n",
  );
  process.exit(2);
}
const serverPath = resolve(serverArg);

async function main(): Promise<void> {
  // Use an isolated bridge port so the smoketest never collides with a real
  // dev server (or another CI job) sitting on the default 9876.
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [serverPath],
    stderr: "inherit",
    env: { ...process.env, TIDY_BRIDGE_PORT: "49876" } as Record<string, string>,
  });
  const client = new Client({ name: "tidy-smoketest", version: "0.0.1" });

  await client.connect(transport); // performs the MCP `initialize` handshake
  print("✓ server started and completed MCP initialize");

  const tools = await client.listTools();
  const got = new Set(tools.tools.map((t) => t.name));
  const expected = CATALOGUE.map((e) => e.id);

  for (const t of tools.tools) print(`  • ${t.name} — ${t.description}`);

  const missing = expected.filter((id) => !got.has(id));
  await client.close();

  if (missing.length > 0) {
    throw new Error(
      `catalogue mismatch — missing tool(s): ${missing.join(", ")}`,
    );
  }
  if (got.size !== expected.length) {
    throw new Error(
      `expected ${expected.length} tools, server served ${got.size}`,
    );
  }

  print(`\n✓ smoketest complete — ${expected.length} tools served from bundle`);
}

function print(s: string): void {
  process.stdout.write(s + "\n");
}

main().catch((err) => {
  process.stderr.write(`smoketest failed: ${(err as Error).stack ?? err}\n`);
  process.exit(1);
});
