// PROTOTYPE scaffold — MCP server. Speaks MCP over stdio; relays each tool
// call to the plugin over the Bridge (WebSocket).
//
// NEVER write to stdout from this process — that channel is the MCP transport.
// All logs go to stderr.

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CATALOGUE } from "./catalogue.ts";
import { BridgeServer } from "./bridge-server.ts";
import type { BridgeError } from "./bridge-server.ts";

const BRIDGE_HOST = process.env.TIDY_BRIDGE_HOST ?? "127.0.0.1";
const BRIDGE_PORT = Number(process.env.TIDY_BRIDGE_PORT ?? 9876);

const log = (msg: string) => process.stderr.write(`[mcp-server] ${msg}\n`);

function isBridgeError(e: unknown): e is BridgeError {
  return typeof e === "object" && e !== null && "code" in e && "message" in e;
}

async function main(): Promise<void> {
  const bridge = new BridgeServer(BRIDGE_HOST, BRIDGE_PORT);
  try {
    log(`listening for plugin at ws://${BRIDGE_HOST}:${BRIDGE_PORT}…`);
    await bridge.listen();
    log("bridge listening; awaiting plugin connection");
  } catch (err) {
    log(`bridge listen failed: ${(err as Error).message}`);
    process.exit(1);
  }

  const server = new McpServer({
    name: "tidy-ds-toolbox",
    version: "0.0.1",
  });

  for (const entry of CATALOGUE) {
    server.registerTool(
      entry.id,
      {
        description: `[${entry.kind}] ${entry.summary}`,
        inputSchema: entry.inputSchema,
      },
      async (input: unknown) => {
        try {
          const result = await bridge.call(entry.id, input ?? {});
          return {
            content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
          };
        } catch (err) {
          const e = isBridgeError(err)
            ? err
            : { code: "INTERNAL", message: String(err), recoverable: false };
          log(`tool '${entry.id}' failed: ${e.code} — ${e.message}`);
          return {
            isError: true,
            content: [
              {
                type: "text",
                text: JSON.stringify(
                  {
                    code: e.code,
                    message: e.message,
                    recoverable: e.recoverable,
                    details: e.details ?? null,
                  },
                  null,
                  2,
                ),
              },
            ],
          };
        }
      },
    );
  }

  await server.connect(new StdioServerTransport());
  log(`MCP server ready — ${CATALOGUE.length} tools registered`);
}

main().catch((err) => {
  log(`fatal: ${(err as Error).stack ?? err}`);
  process.exit(1);
});
