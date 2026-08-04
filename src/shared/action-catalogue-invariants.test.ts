import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it, expect } from "vitest";
import { ACTION_CATALOGUE } from "./action-catalogue";

/**
 * Closes the door #162 opened (#166).
 *
 * These tests assert invariants derived from the actual source of each
 * module's handler, not a snapshot count — adding a legitimate action to a
 * module's dispatch switch, or a legitimate catalogue entry, needs no edit
 * here. The QA checklist catalogue made the count mistake once already
 * (see src/plugins/qa/checklist-catalogue.test.ts); this file follows the
 * corrected shape instead.
 *
 * Discovery works by reading each module's logic.ts source and extracting
 * the case labels of its top-level `switch (action ...)` dispatch, the same
 * switch src/moduleHandlers.ts routes into. That is "every action reachable
 * through the module handlers" in a form a test can check without a Figma
 * runtime.
 */

const PLUGINS_DIR = path.join(__dirname, "..", "plugins");
const SHELL_DIR = __dirname; // src/shared -> src/moduleHandlers.ts is one level up

// Mirrors src/moduleHandlers.ts's target -> module directory wiring. Adding
// a new module means adding a line here (and to moduleHandlers.ts) — a rare,
// deliberate event, unlike adding an action within an existing module, which
// this file discovers automatically.
//
// "ds-explorer" is a deliberate exception: its dispatch switch lives inline
// in src/moduleHandlers.ts (dsExplorerHandler), not in its own logic.ts, so
// it's discovered from moduleHandlers.ts below instead of this map.
const MODULE_LOGIC_FILES: Record<string, string> = {
  "component-labels": "component-labels/logic.ts",
  "tidy-icon-care": "tidy-icon-care/logic.ts",
  "sticker-sheet-builder": "sticker-sheet-builder/logic.ts",
  "tidy-mapper": "tidy-mapper/logic.ts",
  utilities: "utilities/logic.ts",
  audit: "audit/logic.ts",
  "release-notes": "release-notes/logic.ts",
  "off-boarding": "off-boarding/logic.ts",
  iconfinder: "iconfinder/logic.ts",
  "color-finder": "color-finder/logic.ts",
  "tidy-doc": "tidy-doc/logic.ts",
};

/**
 * Extracts the case labels of the first top-level `switch (action ...)` in
 * a source file — the module's action dispatcher — ignoring any other
 * switch statement the file may contain (e.g. a helper switching on a
 * payload field, not the action id).
 */
function extractDispatchedActionIds(source: string): string[] {
  const switchStart = source.indexOf("switch (action");
  if (switchStart === -1) return [];

  const braceStart = source.indexOf("{", switchStart);
  let depth = 0;
  let blockEnd = braceStart;
  for (let i = braceStart; i < source.length; i++) {
    if (source[i] === "{") depth++;
    else if (source[i] === "}") {
      depth--;
      if (depth === 0) {
        blockEnd = i;
        break;
      }
    }
  }

  const block = source.slice(braceStart, blockEnd);
  const ids = new Set<string>();
  const re = /case\s+"([^"]+)"\s*:/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(block))) {
    ids.add(m[1]);
  }
  return [...ids];
}

/**
 * Every action id reachable through src/moduleHandlers.ts, as
 * `target:action`. Includes "mcp-bridge:dispatch" — mcp-bridge's handler
 * isn't a switch (it's a single `if (action !== "dispatch")` guard), so it
 * is added explicitly rather than discovered by the switch-parser above.
 */
function discoverReachableActionIds(): string[] {
  const ids: string[] = ["mcp-bridge:dispatch"];
  for (const [target, relativePath] of Object.entries(MODULE_LOGIC_FILES)) {
    const source = readFileSync(path.join(PLUGINS_DIR, relativePath), "utf-8");
    for (const action of extractDispatchedActionIds(source)) {
      ids.push(`${target}:${action}`);
    }
  }

  // ds-explorer: dispatch switch lives inline in moduleHandlers.ts.
  const moduleHandlersSource = readFileSync(
    path.join(SHELL_DIR, "..", "moduleHandlers.ts"),
    "utf-8",
  );
  for (const action of extractDispatchedActionIds(moduleHandlersSource)) {
    ids.push(`ds-explorer:${action}`);
  }

  return ids;
}

describe("action catalogue invariants (#166)", () => {
  const reachable = discoverReachableActionIds();

  it("discovered at least one action per known module (sanity check on the discovery mechanism itself)", () => {
    // Not a headcount of actions — a floor check that the switch-parser
    // above is actually finding something in every module file, so a
    // silently-broken parser doesn't make every other test here vacuous.
    for (const target of [...Object.keys(MODULE_LOGIC_FILES), "ds-explorer"]) {
      const found = reachable.some((id) => id.startsWith(`${target}:`));
      expect(found, `discovered no actions at all for module '${target}'`).toBe(
        true,
      );
    }
  });

  it("has exactly one action-dispatching switch in moduleHandlers.ts (pins the ds-explorer discovery assumption)", () => {
    // extractDispatchedActionIds only reads the *first* `switch (action`
    // block in moduleHandlers.ts and attributes every case to ds-explorer.
    // If a second inline dispatch switch is ever added above dsExplorerHandler,
    // its cases would be silently misattributed and ds-explorer's real
    // actions would vanish from discovery. This pins that assumption so a
    // second switch fails loudly here instead.
    const moduleHandlersSource = readFileSync(
      path.join(SHELL_DIR, "..", "moduleHandlers.ts"),
      "utf-8",
    );
    const matches = moduleHandlersSource.match(/switch\s*\(\s*action\b/g) ?? [];
    expect(
      matches.length,
      "moduleHandlers.ts now has more than one `switch (action ...)` block — " +
        "update extractDispatchedActionIds/discoverReachableActionIds in this " +
        "file to discover the new one explicitly, the same way ds-explorer is.",
    ).toBe(1);
  });

  it("gives every action reachable through the module handlers a catalogue entry", () => {
    for (const id of reachable) {
      expect(
        ACTION_CATALOGUE[id],
        `action '${id}' has no catalogue entry — add one to src/shared/action-catalogue.ts`,
      ).toBeDefined();
    }
  });

  it("declares no catalogue entry for an action that doesn't exist", () => {
    const reachableSet = new Set(reachable);
    for (const id of Object.keys(ACTION_CATALOGUE)) {
      expect(
        reachableSet.has(id),
        `catalogue entry '${id}' names an action that doesn't exist — remove it from src/shared/action-catalogue.ts`,
      ).toBe(true);
    }
  });

  it("declares no action id twice in the catalogue source", () => {
    const source = readFileSync(
      path.join(__dirname, "action-catalogue.ts"),
      "utf-8",
    );
    const keyRe = /^\s{2}"([^"]+)":\s*\{/gm;
    const seen = new Map<string, number>();
    let m: RegExpExecArray | null;
    while ((m = keyRe.exec(source))) {
      seen.set(m[1], (seen.get(m[1]) ?? 0) + 1);
    }
    for (const [id, count] of seen) {
      expect(
        count,
        `action '${id}' is declared ${count} times in src/shared/action-catalogue.ts — keep exactly one entry`,
      ).toBe(1);
    }
  });

  it("gives every long-running declaration a non-empty reason", () => {
    for (const [id, entry] of Object.entries(ACTION_CATALOGUE)) {
      if (entry.budget.kind === "long-running") {
        expect(
          entry.budget.reason.trim().length,
          `action '${id}' is declared long-running with no reason — add one explaining why it has no deadline`,
        ).toBeGreaterThan(0);
      }
    }
  });
});
