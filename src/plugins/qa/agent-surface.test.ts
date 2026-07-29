/**
 * The QA checklist as agents are *told* about it (#133).
 *
 * The check ids and the row count are written out in two agent-facing places
 * besides the engine: the MCP input schema and the `/tidy-ds:tidy-qa` slash
 * command. Both used to be hand-copied prose, and both went stale - twice
 * (`ee196b4`, `a89c2c3`), each time found only by someone reading the docs later.
 *
 * The failure mode is not a crash, it is an agent being told something untrue:
 * that a check exists when it does not, or - worse, because it is silent - never
 * being told about one that does. In the slash command a missing id is actively
 * wrong: an id it doesn't list gets classified as a *target name* instead, so
 * `/tidy-ds:tidy-qa high-contrast` would hunt for a component called
 * "high-contrast" and report NOT_FOUND.
 *
 * Both copies are hand-written on purpose. The Markdown is the readable source of
 * the command, and the MCP schema cannot import the engine at all: the engine's
 * modules use extensionless specifiers, which Node's raw ESM resolver (used by
 * `npm run mcp:smoketest:src`) will not resolve. So this file is what turns
 * drift in either place into a red test rather than a stale instruction.
 */

import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";
import { CATALOGUE } from "../../../mcp-server/src/catalogue";
import { CHECKLIST_CATALOGUE, CHECK_IDS } from "./checklist-catalogue";

const QA_COMMAND = readFileSync(
  new URL("../../../claude-plugin/commands/tidy-qa.md", import.meta.url),
  "utf8",
);

function entry(id: string) {
  const found = CATALOGUE.find((e) => e.id === id);
  if (!found) throw new Error(`no catalogue entry for ${id}`);
  return found;
}

describe("the MCP input schema", () => {
  it("lists exactly the engine's check ids, in checklist order", () => {
    const description = entry("tidy_qa_run").inputSchema.checks?.description;
    const listed = description
      ?.replace(/^.*Defaults to the full catalogue: /s, "")
      .replace(/\.\s*$/, "")
      .split(", ");
    expect(listed).toEqual([...CHECK_IDS]);
  });

  for (const id of ["tidy_qa_run", "tidy_qa_build_checklist"] as const) {
    it(`enumerates exactly the engine's check ids (${id})`, () => {
      const schema = entry(id).inputSchema.checks;
      // The enum's own options, not just what it accepts: asserting acceptance
      // alone would let the schema carry an *extra* id the engine has never
      // heard of, which is the drift direction that tells an agent a check
      // exists when it does not.
      // `z.array(z.enum(...)).optional().describe(...)` - unwrap the optional to
      // the array, then read the element enum's own options.
      const unwrapped = (
        schema as unknown as {
          unwrap(): { element: { options: readonly string[] } };
        }
      ).unwrap();
      expect(unwrapped.element.options).toEqual([...CHECK_IDS]);

      expect(schema?.safeParse([...CHECK_IDS]).success).toBe(true);
      // Rejected here, with the valid set in the error, rather than after a
      // round trip to a plugin that may not even be connected.
      expect(schema?.safeParse(["high-contast"]).success).toBe(false);
    });
  }

  it("states the real row count in both QA summaries", () => {
    const rows = String(CHECKLIST_CATALOGUE.length);
    for (const id of ["tidy_qa_run", "tidy_qa_build_checklist"] as const) {
      const numbers = entry(id).summary.match(/\b\d+(?=[- ](?:item|rows))/g);
      expect(numbers?.length).toBeGreaterThan(0);
      expect(numbers?.every((n) => n === rows)).toBe(true);
    }
  });
});

describe("the /tidy-ds:tidy-qa command", () => {
  it("classifies exactly the engine's check ids as check filters", () => {
    // The ids live in the "Check-id" bullet, backticked one per id, between the
    // bullet's opening and the sentence about the `checks` array.
    const bullet = QA_COMMAND.slice(
      QA_COMMAND.indexOf(
        "checklist order:",
        QA_COMMAND.indexOf("- **Check-id**"),
      ),
      QA_COMMAND.indexOf("Collect these into"),
    );
    expect(bullet).not.toBe("");
    const listed = [...bullet.matchAll(/`([a-z0-9-]+)`/g)].map((m) => m[1]);
    expect(listed).toEqual([...CHECK_IDS]);
  });

  it("states the real row count where it claims the buckets sum", () => {
    const claim = QA_COMMAND.match(
      /The status buckets sum to exactly (\d+)/,
    )?.[1];
    expect(claim).toBe(String(CHECKLIST_CATALOGUE.length));
  });
});
