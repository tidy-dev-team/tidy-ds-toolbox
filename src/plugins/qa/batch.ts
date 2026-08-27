/**
 * Batched id lookups for the QA read phase.
 *
 * Everything the collector and the theme probe resolve by id - variables,
 * variable collections, paint styles - is an independent read with no ordering
 * dependency between iterations. Awaited one at a time, as all of them were,
 * the cost is one sandbox round trip per id paid end to end, and a component
 * set that binds a few hundred variables pays a few hundred of them before any
 * check has run.
 *
 * The dedup and the ordering are the parts worth keeping honest, so they live
 * here rather than being rewritten at each call site. Order matters because
 * callers iterate the result: the theme probe's `unavailable` list reaches a
 * check that reports the ids it was given, and a set of findings that reorders
 * itself between runs on the same component reads as churn.
 */

/**
 * Resolves every unique id at once and returns what each one loaded, keyed by
 * id in first-appearance order.
 *
 * An id whose lookup found nothing is kept with a `null` value rather than
 * omitted. That distinction is load-bearing for the checks: a binding Figma
 * cannot load is a defect to report, not an absence to skip, and the caller
 * needs the id to report it.
 *
 * A rejecting lookup propagates, as it did when these were awaited in turn -
 * with one difference that is worth stating rather than glossing: the other
 * lookups have already been issued by then, where the sequential loop stopped
 * at the failure. Nothing observable changes, because every `load` here is a
 * read. It would matter if one ever wrote.
 *
 * `load` is expected to translate "not found" into `null` itself, which is what
 * the Figma `get...ByIdAsync` family already does.
 */
export async function loadByIdInOrder<T>(
  ids: readonly string[],
  load: (id: string) => Promise<T | null>,
): Promise<Map<string, T | null>> {
  const unique = [...new Set(ids)];
  const loaded = await Promise.all(unique.map((id) => load(id)));
  return new Map(unique.map((id, i) => [id, loaded[i]]));
}
