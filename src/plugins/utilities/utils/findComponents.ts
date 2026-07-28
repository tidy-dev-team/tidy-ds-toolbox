// Selection + capping logic for `tidy_misprint_find_components` (#128).
//
// Split out of the Operation handler so it is pure and testable: the handler
// gathers candidates from Figma, this decides which of them come back.
//
// Why a cap exists at all: a whole-file walk of an icon library returns
// thousands of components, and 841 of them already produced 79k characters,
// well past the MCP output ceiling. The cap keeps the response inside the
// ceiling, and `truncated`/`omitted` keep it honest about doing so. Silent
// truncation would be worse than the timeout it replaces: an agent reading a
// short list as the complete file picks the wrong target and never knows.
//
// The two limit constants are imported by mcp-server/src/catalogue.ts so the
// advertised schema and the enforced behaviour cannot drift apart.

import { ErrorCode, OperationError } from "../../../shared/operations/errors";
import { globToRegex } from "../../../shared/operations/glob";

/** Default cap, chosen to stay inside the MCP output ceiling at ~95 chars/row. */
export const DEFAULT_FIND_LIMIT = 200;

/** Hard ceiling on an explicit `limit`. Above this the response spills anyway. */
export const MAX_FIND_LIMIT = 1000;

export interface ComponentRef {
  id: string;
  name: string;
}

export interface SelectComponentsOptions {
  /** `*`-only glob matched against node names. Omitted means "everything". */
  namePattern?: string;
  /** Cap on returned rows. Defaults to DEFAULT_FIND_LIMIT. */
  limit?: number;
}

export interface SelectComponentsResult {
  components: ComponentRef[];
  /** How many candidates matched, before the cap. */
  total: number;
  /** True when the cap dropped rows from `components`. */
  truncated: boolean;
  /** `total - components.length`. Zero when nothing was dropped. */
  omitted: number;
  /** The cap actually applied, so the agent can raise it deliberately. */
  limit: number;
  summary: string;
}

function resolveLimit(limit: number | undefined): number {
  if (limit === undefined) return DEFAULT_FIND_LIMIT;
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_FIND_LIMIT) {
    throw new OperationError(
      ErrorCode.INVALID_PARAMS,
      `limit must be an integer between 1 and ${MAX_FIND_LIMIT}`,
      true,
      { limit, max: MAX_FIND_LIMIT },
    );
  }
  return limit;
}

export function selectComponents(
  candidates: readonly ComponentRef[],
  options: SelectComponentsOptions,
): SelectComponentsResult {
  const limit = resolveLimit(options.limit);

  const pattern = options.namePattern ? globToRegex(options.namePattern) : null;
  const matches = pattern
    ? candidates.filter((c) => pattern.test(c.name))
    : candidates;

  const components = matches.slice(0, limit).map((c) => ({
    id: c.id,
    name: c.name,
  }));
  const omitted = matches.length - components.length;

  return {
    components,
    total: matches.length,
    truncated: omitted > 0,
    omitted,
    limit,
    summary:
      omitted > 0
        ? `${components.length} of ${matches.length} component(s) returned; ${omitted} omitted by limit=${limit}. ` +
          `Narrow with namePattern, scope to one page (list them with tidy_file_list_pages), or raise limit.`
        : `${matches.length} component(s) matched`,
  };
}
