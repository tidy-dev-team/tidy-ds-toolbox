// The QA checklist build's stop decision (#185).
//
// runQa's stop boundaries sit before each of its three read phases and never
// inside one, because every phase is one committed unit and the first draw
// happens outside this function entirely (in composeChecklistArtifacts, which
// never receives a token - see stopMessages.test.ts for that half). What is
// under test here is the decision itself: given a token cancelled at a
// specific point, does runQa actually stop where it claims to, and does it
// never run a later phase once it has?
//
// The read phases (resolveTarget, prepareSnapshot, runChecks) are figma-
// touching and mocked out entirely, so this drives the real loop in
// operations.ts against a stand-in for the token, with no Figma involved.

import { describe, it, expect, vi, afterEach } from "vitest";
import { createCancellationToken } from "../../shared/cancellation";
import { createPhaseTimer } from "./phase-timing";

const { resolveTarget, prepareSnapshot, runChecks } = vi.hoisted(() => ({
  resolveTarget: vi.fn(),
  prepareSnapshot: vi.fn(),
  runChecks: vi.fn(),
}));

vi.mock("./subject", () => ({ resolveTarget }));
vi.mock("./collector", () => ({ prepareSnapshot }));
vi.mock("./checks", () => ({ runChecks, unknownCheckIds: () => [] }));
vi.mock("./report", () => ({ buildChecklistReport: () => ({ counts: {} }) }));
vi.mock("./variable-usage", () => ({ bindsOwnThemeVariables: () => false }));

const { runQa } = await import("./operations");

const SUBJECT = { id: "1:1", name: "Button", type: "COMPONENT_SET" };

describe("runQa stop boundary", () => {
  afterEach(() => {
    resolveTarget.mockReset();
    prepareSnapshot.mockReset();
    runChecks.mockReset();
  });

  it("stops before resolving the target when already cancelled, and never resolves", async () => {
    const token = createCancellationToken();
    token.cancel();

    const outcome = await runQa({}, createPhaseTimer(), token);

    expect(outcome).toEqual({ cancelled: true });
    expect(resolveTarget).not.toHaveBeenCalled();
  });

  it("stops after resolving but before the snapshot, naming the resolved target", async () => {
    const token = createCancellationToken();
    // Cancel only once resolveTarget has actually been awaited, so the first
    // checkpoint (before resolving) is seen as not-yet-cancelled.
    resolveTarget.mockImplementationOnce(async () => {
      token.cancel();
      return { subject: SUBJECT, origin: null };
    });

    const outcome = await runQa({}, createPhaseTimer(), token);

    expect(outcome).toEqual({ cancelled: true, targetName: "Button" });
    expect(prepareSnapshot).not.toHaveBeenCalled();
  });

  it("stops after the snapshot but before running checks", async () => {
    const token = createCancellationToken();
    resolveTarget.mockResolvedValueOnce({ subject: SUBJECT, origin: null });
    prepareSnapshot.mockImplementationOnce(async () => {
      token.cancel();
      return { theme: null };
    });

    const outcome = await runQa({}, createPhaseTimer(), token);

    expect(outcome).toEqual({ cancelled: true, targetName: "Button" });
    expect(runChecks).not.toHaveBeenCalled();
  });

  it("runs to completion when never cancelled", async () => {
    const token = createCancellationToken();
    resolveTarget.mockResolvedValueOnce({ subject: SUBJECT, origin: null });
    prepareSnapshot.mockResolvedValueOnce({ theme: null });
    runChecks.mockResolvedValueOnce({ results: [], notImplemented: [] });

    const outcome = await runQa({}, createPhaseTimer(), token);

    expect("cancelled" in outcome).toBe(false);
  });
});
