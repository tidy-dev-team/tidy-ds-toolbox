// PROTOTYPE scaffold — end-to-end test client.
// Spawns ./server.ts as a subprocess, speaks MCP over its stdio, and calls
// each tool. Verifies the full Claude → MCP → Bridge → operation path without
// needing Claude Code configured.
//
// Run plugin-sim in another terminal first:
//   npm run prototype:plugin-sim

import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const here = dirname(fileURLToPath(import.meta.url));
const serverPath = join(here, "server.ts");

async function main(): Promise<void> {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [serverPath],
    stderr: "inherit",
  });
  const client = new Client({ name: "tidy-smoketest", version: "0.0.1" });
  await client.connect(transport);

  banner("listTools");
  const tools = await client.listTools();
  for (const t of tools.tools) print(`  • ${t.name} — ${t.description}`);

  banner("tidy_misprint_find_components { scope: 'file' }");
  await callAndPrint(client, "tidy_misprint_find_components", { scope: "file" });

  banner("tidy_misprint_find_components { scope: 'page', pageId: 'page1', namePattern: 'Btn*' }");
  const findRes = await callAndPrint(client, "tidy_misprint_find_components", {
    scope: "page",
    pageId: "page1",
    namePattern: "Btn*",
  });

  banner("tidy_misprint_apply with last-found ids");
  const ids = extractIds(findRes);
  await callAndPrint(client, "tidy_misprint_apply", { nodeIds: ids });

  banner("tidy_misprint_apply with bogus id → NOT_FOUND");
  await callAndPrint(client, "tidy_misprint_apply", { nodeIds: ["n1", "n_bogus"] });

  banner("tidy_misprint_apply with FRAME mixed in → WRONG_NODE_TYPE");
  await callAndPrint(client, "tidy_misprint_apply", { nodeIds: ["n1", "n5"] });

  banner("tidy_ds_template_run (twice — pages should duplicate)");
  await callAndPrint(client, "tidy_ds_template_run", {});
  await callAndPrint(client, "tidy_ds_template_run", {});

  banner("tidy_misprint_find_components missing pageId → INVALID_PARAMS");
  await callAndPrint(client, "tidy_misprint_find_components", { scope: "page" });

  await client.close();
  print("\n✓ smoketest complete");
}

function banner(text: string): void {
  print(`\n\x1b[1m── ${text} ──\x1b[0m`);
}
function print(s: string): void {
  process.stdout.write(s + "\n");
}

async function callAndPrint(
  client: Client,
  name: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  try {
    const res = await client.callTool({ name, arguments: args });
    const body = (res.content as Array<{ type: string; text: string }>)[0]?.text ?? "(empty)";
    const tag = res.isError ? "\x1b[31merror\x1b[0m" : "\x1b[32mok\x1b[0m";
    print(`${tag} ${body}`);
    try { return JSON.parse(body); } catch { return body; }
  } catch (err) {
    print(`\x1b[31mthrew\x1b[0m ${(err as Error).message}`);
    return null;
  }
}

function extractIds(parsed: unknown): string[] {
  if (parsed && typeof parsed === "object" && Array.isArray((parsed as { ids?: unknown }).ids)) {
    return (parsed as { ids: string[] }).ids;
  }
  return [];
}

main().catch((err) => {
  process.stderr.write(`smoketest failed: ${(err as Error).stack ?? err}\n`);
  process.exit(1);
});
