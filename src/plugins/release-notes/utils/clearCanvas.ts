import type {
  ClearCanvasCandidate,
  ClearCanvasCandidateOwnership,
} from "../types";

/** Select verified output by default. Legacy-name matches need an explicit choice. */
export function defaultClearCanvasSelection(
  candidates: readonly ClearCanvasCandidate[],
): string[] {
  return candidates
    .filter((candidate) => candidate.ownership === "verified-stamped")
    .map((candidate) => candidate.id);
}

/**
 * Keep only selected IDs that are present in the fresh candidate list.
 *
 * The caller builds that list again at deletion time.
 * This makes stale, removed, renamed, and ordinary nodes fall out without a
 * broad name sweep.
 */
export function planClearCanvasDeletion(
  currentCandidates: readonly ClearCanvasCandidate[],
  selectedNodeIds: readonly string[],
): string[] {
  const selected = new Set(selectedNodeIds);
  return currentCandidates
    .filter((candidate) => selected.has(candidate.id))
    .map((candidate) => candidate.id);
}

/** The user-facing label for a candidate ownership classification. */
export function clearCanvasOwnershipLabel(
  ownership: ClearCanvasCandidateOwnership,
): string {
  return ownership === "verified-stamped"
    ? "Verified stamped output"
    : "Unverified legacy-name match";
}
