// The Documentation Page builder's in-flight guard (#187).

import { ErrorCode, OperationError } from "../../../shared/operations/errors";

/** Which way into the builder a build came through. */
export type BuildOrigin = "agent" | "panel";

export interface DocPageBuild {
  /** Source component id - the key, since one page is built per component. */
  sourceId: string;
  /** Source component name, for the refusal message. */
  sourceName: string;
  origin: BuildOrigin;
}

/**
 * How the refusal names whoever holds the key. The route matters to the
 * reader: a designer who clicked nothing has no other way to learn that an
 * agent is mid-build, and reads a bare refusal as the tool being stuck.
 */
const HOLDER_PHRASE: Record<BuildOrigin, string> = {
  agent: "by an agent",
  panel: "from the plugin panel",
};

const IN_FLIGHT = new Map<string, DocPageBuild>();

/**
 * Runs `build` while holding the lock for its source component, refusing a
 * second build of the same component with `BUSY`.
 */
export async function withDocPageBuildLock<T>(
  build: DocPageBuild,
  run: () => Promise<T>,
): Promise<T> {
  const holder = IN_FLIGHT.get(build.sourceId);
  if (holder) {
    throw new OperationError(
      ErrorCode.BUSY,
      `${build.sourceName} is already being built ${HOLDER_PHRASE[holder.origin]}. ` +
        `Wait for that build to finish before starting another one.`,
      true,
      { sourceId: build.sourceId, runningOrigin: holder.origin },
    );
  }
  IN_FLIGHT.set(build.sourceId, build);
  try {
    return await run();
  } finally {
    // Every path out, including a section builder throwing half way. A leak
    // here walls that component off for the rest of the session, and the
    // designer's only recovery would be reopening the plugin.
    IN_FLIGHT.delete(build.sourceId);
  }
}
