// The Documentation Page builder's in-flight guard (#187). No Figma: the lock
// takes a plain async function, so a designer's click landing mid-agent-build
// is reproducible here even though the real collision is between a click and
// an MCP call.

import { describe, it, expect } from "vitest";
import { withDocPageBuildLock } from "./buildLock";
import type { OperationError } from "../../../shared/operations/errors";

/** A build that hangs until the test lets it finish. */
function pendingBuild(): { run: () => Promise<string>; finish: () => void } {
  let finish!: () => void;
  const gate = new Promise<void>((resolve) => {
    finish = resolve;
  });
  return {
    run: async () => {
      await gate;
      return "page-frame-id";
    },
    finish,
  };
}

/** Awaits a build that is expected to be refused, and hands back the refusal. */
async function refusalFrom(build: Promise<unknown>): Promise<OperationError> {
  try {
    await build;
  } catch (err) {
    return err as OperationError;
  }
  throw new Error("expected the build to be refused, but it ran");
}

const BUTTON = { sourceId: "1:100", sourceName: "Button" };

describe("one build per Documentation Page", () => {
  it("refuses a panel build while an agent's build of the same component runs", async () => {
    const agentBuild = pendingBuild();
    const running = withDocPageBuildLock(
      { ...BUTTON, origin: "agent" },
      agentBuild.run,
    );

    // The designer clicks Document while the agent is mid-build. This click
    // never passes through the Operation registry, so #186's guard cannot
    // see it - only the builder's own lock can.
    await expect(
      withDocPageBuildLock(
        { ...BUTTON, origin: "panel" },
        async () => "second",
      ),
    ).rejects.toMatchObject({ code: "BUSY" });

    agentBuild.finish();
    await running;
  });

  it("names the component and the agent that holds it, and says to wait", async () => {
    const agentBuild = pendingBuild();
    const running = withDocPageBuildLock(
      { ...BUTTON, origin: "agent" },
      agentBuild.run,
    );

    const refusal = await refusalFrom(
      withDocPageBuildLock(
        { ...BUTTON, origin: "panel" },
        async () => "second",
      ),
    );

    // A designer who clicked nothing wrong needs to know an agent is mid
    // build; without that the refusal reads as the tool being stuck.
    expect(refusal.message).toContain("Button");
    expect(refusal.message).toMatch(/agent/i);
    expect(refusal.message).toMatch(/wait/i);

    agentBuild.finish();
    await running;
  });

  it("refuses in the other order too: an agent's build while the panel is building", async () => {
    const panelBuild = pendingBuild();
    const running = withDocPageBuildLock(
      { ...BUTTON, origin: "panel" },
      panelBuild.run,
    );

    const refusal = await refusalFrom(
      withDocPageBuildLock(
        { ...BUTTON, origin: "agent" },
        async () => "second",
      ),
    );

    expect(refusal.code).toBe("BUSY");
    expect(refusal.message).toMatch(/panel/i);

    panelBuild.finish();
    await running;
  });

  it("lets two different components build at once, one per route", async () => {
    const first = pendingBuild();
    const second = pendingBuild();

    const button = withDocPageBuildLock(
      { sourceId: "1:100", sourceName: "Button", origin: "agent" },
      first.run,
    );
    // Keyed by component on purpose: unlike the QA probe sweep, which is
    // page-scoped and so collides across components, two Documentation Page
    // builds touch nothing in common.
    const card = withDocPageBuildLock(
      { sourceId: "2:200", sourceName: "Card", origin: "panel" },
      second.run,
    );

    first.finish();
    second.finish();

    await expect(button).resolves.toBe("page-frame-id");
    await expect(card).resolves.toBe("page-frame-id");
  });

  it("releases the key when a build throws part way through", async () => {
    const half = { sourceId: "2:200", sourceName: "Card" };

    await expect(
      withDocPageBuildLock({ ...half, origin: "agent" }, async () => {
        throw new Error("section builder blew up");
      }),
    ).rejects.toThrow("section builder blew up");

    // A build that dies half way must not wall the component off for the
    // rest of the session - the designer's next click has to get through.
    await expect(
      withDocPageBuildLock({ ...half, origin: "panel" }, async () => "retry"),
    ).resolves.toBe("retry");
  });
});
