import { describe, it, expect } from "vitest";
import { describeStepFailure } from "./step-failure.mjs";

describe("describeStepFailure", () => {
  it("names the step that failed, and drops the child process's stack", () => {
    const err = new Error("Command failed: claude plugin install");
    err.stack =
      "Error: Command failed\n    at execFileSync (node:child_process:961:15)\n    at run (dogfood-plugin.mjs:30:28)";

    const text = describeStepFailure(
      "installing tidy-ds@tidy-ds-marketplace",
      err,
    ).join("\n");

    // What went wrong, in the reader's terms.
    expect(text).toContain("installing tidy-ds@tidy-ds-marketplace");
    // Not in Node's. The stack is what buried the real diagnosis last time:
    // verify-plugin had already said exactly what was wrong, and it scrolled
    // away behind an ErrnoException dump ending in "Node.js v24.10.0".
    expect(text).not.toContain("execFileSync");
    expect(text).not.toContain("node:child_process");
  });
});
