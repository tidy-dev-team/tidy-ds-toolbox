// Every document-writing Operation stops when asked (#185 AC: "after this
// ticket, every Execute Operation that writes to the document is stoppable").
//
// The invariant lives here rather than in each module because it is exactly
// the kind of statement a per-module test forgets: a new Execute Operation
// lands, its author forgets the flag, and cancellation quietly answers
// `not_cancellable` for it for ever. Importing `register-all` pulls in every
// production registration, so the walk covers the real registry rather than a
// hand-typed list.
//
// The test-only sleepers are excluded by their `tidy_test_` prefix on
// purpose: one of them models the not-cancellable case for the cancellation
// route's own tests, which is the one honest exception this invariant exists
// to bound.

import { describe, it, expect } from "vitest";
import { registeredOperationSpecs } from "./registry";
import "./register-all";

const EXECUTE_IDS = [
  "tidy_misprint_apply",
  "tidy_ds_template_run",
  "tidy_component_labels_build",
  "tidy_ds_explorer_place_set",
  "tidy_doc_build_page",
  "tidy_qa_build_checklist",
];

describe("every Execute Operation is stoppable", () => {
  const specs = registeredOperationSpecs();
  const execute = specs.filter(
    (spec) => spec.kind === "execute" && !spec.id.startsWith("tidy_test_"),
  );

  it("is true of every production Execute Operation", () => {
    const missing = execute.filter((spec) => spec.cancellable !== true);
    expect(
      missing.map((spec) => spec.id),
      `these Execute Operations do not declare cancellable: true`,
    ).toEqual([]);
  });

  it("has Execute Operations to check at all", () => {
    // Guards the walk itself: if register-all stops pulling the modules in,
    // the filter above would pass vacuously over an empty list.
    expect(execute.length).toBeGreaterThanOrEqual(EXECUTE_IDS.length);
  });

  it.each(EXECUTE_IDS)("covers %s", (id) => {
    const spec = specs.find((s) => s.id === id);
    expect(spec, `${id} is not registered`).toBeDefined();
    expect(spec?.cancellable).toBe(true);
  });
});
