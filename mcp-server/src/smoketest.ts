// CI gate for the MCP server. Runs against two targets:
//
//   • the *bundled* server (dist/server.cjs) — the exact artifact designers
//     run, via `npm run mcp:smoketest`.
//   • the *raw source* server (src/server.ts under --experimental-strip-types)
//     — the exact command the dev MCP config runs, via `npm run
//     mcp:smoketest:src`. This is the one that catches ESM/CJS boundary
//     regressions: a cross-import from the ESM `mcp-server` into a commonjs
//     package's `.ts` fails to load natively, and only the raw-source path
//     reproduces it (the bundle erases the boundary). See fix/esm-module-type.
//
// Either way it spawns the server as a subprocess, speaks MCP over its stdio,
// and asserts it starts and serves the operation catalogue. `listTools` forces
// the catalogue to register and serialize its zod schemas to JSON Schema —
// exercising zod end-to-end.
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

// Path to the server is passed as the first arg: dist/server.cjs (bundled) or
// mcp-server/src/server.ts (raw source). Resolving it here avoids import.meta /
// __dirname, which don't survive the same way through the CJS bundle.
const serverArg = process.argv[2];
if (!serverArg) {
  process.stderr.write(
    "smoketest: missing server path argument (dist/server.cjs or src/server.ts)\n",
  );
  process.exit(2);
}
const serverPath = resolve(serverArg);

// A .ts target must be run through the type stripper, exactly as the dev MCP
// config does; a bundled .cjs runs on plain node.
const serverArgs = serverPath.endsWith(".ts")
  ? ["--experimental-strip-types", serverPath]
  : [serverPath];

async function main(): Promise<void> {
  // Use an isolated bridge port so the smoketest never collides with a real
  // dev server (or another CI job) sitting on the default 9876.
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: serverArgs,
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

  print(
    `\n✓ smoketest complete — ${expected.length} tools served from ${serverArg}`,
  );
}

function print(s: string): void {
  process.stdout.write(s + "\n");
}

main().catch((err) => {
  process.stderr.write(`smoketest failed: ${(err as Error).stack ?? err}\n`);
  process.exit(1);
});
