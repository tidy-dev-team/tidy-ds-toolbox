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
// It also round-trips one real operation through the Bridge against a **plugin
// sim** — a bare WebSocket client that answers a canned result. That covers the
// whole path an agent actually travels (MCP stdio -> catalogue -> bridge
// envelope -> content blocks) with only Figma itself replaced, which is what
// makes it able to prove #116: that an image comes back as a *viewable* image
// block and not as base64 buried in text.
//
// Run via `npm run mcp:smoketest`, which bundles first.

import { resolve } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { WebSocket } from "ws";
import { CATALOGUE } from "./catalogue.ts";

const BRIDGE_PORT = 49876;

/** A 1x1 PNG. Small, but a real decodable image, so a viewer can prove it. */
const PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==";

/**
 * Stand in for the Figma plugin: dial the bridge and answer every request with
 * a fixed result. The bridge has no handshake - whoever connects is the plugin
 * (ADR-0005, no auth on loopback) - so this is the whole sim.
 */
function startPluginSim(result: unknown): Promise<{ close: () => void }> {
  return new Promise((resolveSim, rejectSim) => {
    const ws = new WebSocket(`ws://127.0.0.1:${BRIDGE_PORT}`);
    ws.on("open", () => resolveSim({ close: () => ws.close() }));
    ws.on("error", rejectSim);
    ws.on("message", (raw) => {
      const req = JSON.parse(raw.toString()) as { id: string };
      ws.send(JSON.stringify({ id: req.id, ok: true, result }));
    });
  });
}

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
    env: { ...process.env, TIDY_BRIDGE_PORT: String(BRIDGE_PORT) } as Record<
      string,
      string
    >,
  });
  const client = new Client({ name: "tidy-smoketest", version: "0.0.1" });

  await client.connect(transport); // performs the MCP `initialize` handshake
  print("✓ server started and completed MCP initialize");

  const tools = await client.listTools();
  const got = new Set(tools.tools.map((t) => t.name));
  const expected = CATALOGUE.map((e) => e.id);

  for (const t of tools.tools) print(`  • ${t.name} — ${t.description}`);

  const missing = expected.filter((id) => !got.has(id));

  // In a finally, so a failed assertion still tears the server subprocess down.
  // Without it a red smoketest hangs instead of failing, which in CI reads as a
  // stuck job rather than a broken build.
  try {
    await roundTripImage(client);
  } finally {
    await client.close();
  }

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

/**
 * #116: an operation that returns an image must deliver it as an MCP image
 * content block, not as base64 inside the JSON text. A model cannot see a
 * base64 string, so the old behaviour spent the render, the transfer and a great
 * many tokens to convey nothing at all.
 */
async function roundTripImage(client: Client): Promise<void> {
  const sim = await startPluginSim({
    name: "Button",
    key: "abc123",
    type: "COMPONENT_SET",
    description: "",
    properties: [],
    nestedInstances: [],
    image: `data:image/png;base64,${PNG_BASE64}`,
  });
  try {
    const res = (await client.callTool({
      name: "tidy_ds_explorer_get_component",
      arguments: { name: "Button", includeImage: true },
    })) as { content: Array<{ type: string; text?: string; data?: string; mimeType?: string }> };

    const images = res.content.filter((c) => c.type === "image");
    if (images.length !== 1) {
      throw new Error(
        `expected exactly 1 image content block, got ${images.length} ` +
          `(block types: ${res.content.map((c) => c.type).join(", ")})`,
      );
    }
    if (images[0].mimeType !== "image/png") {
      throw new Error(`image block mimeType was '${images[0].mimeType}'`);
    }
    if (images[0].data !== PNG_BASE64) {
      throw new Error("image block data is not the payload the plugin returned");
    }

    // The point of lifting it out: the base64 must no longer be sitting in the
    // text block burning tokens for something the model cannot read.
    const text = res.content.find((c) => c.type === "text")?.text ?? "";
    if (text.includes(PNG_BASE64)) {
      throw new Error("base64 payload is still embedded in the text block");
    }
    if (!text.includes('"name": "Button"')) {
      throw new Error("text block lost the rest of the result");
    }
    print("✓ image operation round-tripped as a real image content block");
  } finally {
    sim.close();
  }
}

function print(s: string): void {
  process.stdout.write(s + "\n");
}

main().catch((err) => {
  process.stderr.write(`smoketest failed: ${(err as Error).stack ?? err}\n`);
  process.exit(1);
});
