/// <reference types="@figma/plugin-typings" />

/**
 * Resolving what a QA run is about.
 *
 * Every QA Operation starts by turning what the caller pointed at - a node id, a
 * name or glob, or nothing at all - into the component set the checks run
 * against. That is one concern with three entrances, and it is figma-touching in
 * a way the rest of the run is not: it is the only part that searches the
 * document rather than reading a component it was handed.
 */

import { ErrorCode, OperationError } from "../../shared/operations/errors";
import { globToMatcher } from "../../shared/operations/glob";

/** What the checks run against: a component set, or a component standing alone. */
export type QaSubject = ComponentSetNode | ComponentNode;

/**
 * A node a QA run can start from.
 *
 * Named because it is the fact two `as` casts used to stand in for. The three
 * types are exactly the ones `resolveUp` can carry upwards, they are all
 * `SceneNode` subtypes, and both of those things had to be re-asserted by hand
 * at every call site that wanted the narrower type. One guard states it once
 * and the compiler carries it from there.
 */
export type TargetNode = ComponentSetNode | ComponentNode | InstanceNode;

function isTargetNode(node: BaseNode): node is TargetNode {
  return (
    node.type === "COMPONENT_SET" ||
    node.type === "COMPONENT" ||
    node.type === "INSTANCE"
  );
}

/** Resolve any pointed-at node up to the owning component set (or standalone component). */
async function resolveUp(node: BaseNode): Promise<QaSubject | null> {
  // The guard rather than a `default` branch, so the type list lives in one
  // place and the switch below is exhaustive over it.
  if (!isTargetNode(node)) return null;
  switch (node.type) {
    case "COMPONENT_SET":
      return node;
    case "COMPONENT":
      return node.parent?.type === "COMPONENT_SET" ? node.parent : node;
    case "INSTANCE": {
      const main = await node.getMainComponentAsync();
      return main ? resolveUp(main) : null;
    }
  }
}

function wrongNodeType(node: BaseNode): OperationError {
  return new OperationError(
    ErrorCode.WRONG_NODE_TYPE,
    `node ${node.id} (${node.type}) does not resolve to a component set`,
    true,
    { nodeId: node.id, nodeType: node.type },
  );
}

/**
 * Resolve a concrete node up to its owning set, or throw WRONG_NODE_TYPE, and
 * hand back the node itself as the `TargetNode` it has just been proven to be.
 *
 * Returning the narrowed node is the point: callers need it as a `SceneNode` for
 * `origin`, and before this they got there with `node as SceneNode` - a claim
 * the compiler cannot check, sitting a long way from the check that makes it
 * true. Two guards rather than one because they answer different questions: the
 * first that this is a type QA can start from, the second that it actually leads
 * somewhere (an instance whose main component is gone passes the first and fails
 * the second).
 */
async function subjectFromNode(
  node: BaseNode,
): Promise<{ subject: QaSubject; origin: TargetNode }> {
  if (!isTargetNode(node)) throw wrongNodeType(node);
  const subject = await resolveUp(node);
  if (!subject) throw wrongNodeType(node);
  return { subject, origin: node };
}

/**
 * The QA subject plus the node the run actually started from (`origin`) - an
 * instance/component/set for the nodeId and selection paths, or null for the
 * name/glob path. Carrying the origin here avoids a second node fetch just to
 * discover whether the run began at an instance.
 *
 * `origin` is a `TargetNode` (not `BaseNode`, and no longer a bare `SceneNode`)
 * because it is only ever set from a node `subjectFromNode` has accepted, and
 * that function now returns the narrowed node rather than leaving each caller to
 * assert it.
 */
export interface ResolvedTarget {
  subject: QaSubject;
  origin: TargetNode | null;
}

/** How a caller said what to check. Only the two fields that name a target. */
export interface TargetRequest {
  nodeId?: string;
  name?: string;
}

export async function resolveTarget(
  request: TargetRequest,
): Promise<ResolvedTarget> {
  if (request.nodeId) {
    const node = await figma.getNodeByIdAsync(request.nodeId);
    if (!node) {
      throw new OperationError(
        ErrorCode.NOT_FOUND,
        `node ${request.nodeId} not found`,
        true,
        { nodeId: request.nodeId },
      );
    }
    return subjectFromNode(node);
  }

  // no explicit target → fall back to the current selection
  if (!request.name) {
    const selection = figma.currentPage.selection;
    if (selection.length === 0) {
      throw new OperationError(
        ErrorCode.INVALID_PARAMS,
        "no target and nothing selected - select a component/component set/instance, or pass a nodeId or name",
      );
    }
    return subjectFromNode(selection[0]);
  }

  // name / glob path
  const pattern = globToMatcher(request.name);
  await figma.loadAllPagesAsync();
  const candidates = figma.root.findAllWithCriteria({
    types: ["COMPONENT", "COMPONENT_SET"],
  });

  // Awaited in turn, deliberately, unlike the three id-lookup loops #213
  // batched. This one looked like a fourth and is not: the criteria above admit
  // no instances, and `resolveUp` awaits only for an instance, so every call
  // here settles without a round trip. Batching it measured zero and left a
  // `Promise.all` implying a cost that is not there - which is worse than the
  // loop, because the next reader has to work out that it saves nothing.
  const subjects = new Map<string, QaSubject>();
  for (const candidate of candidates) {
    if (!pattern.test(candidate.name)) continue;
    const subject = await resolveUp(candidate);
    if (subject) subjects.set(subject.id, subject);
  }
  const uniqueSubjects = [...subjects.values()];

  if (uniqueSubjects.length === 0) {
    throw new OperationError(
      ErrorCode.NOT_FOUND,
      `no component or component set matches '${request.name}'`,
      true,
      { name: request.name },
    );
  }
  if (uniqueSubjects.length > 1) {
    throw new OperationError(
      ErrorCode.INVALID_PARAMS,
      `'${request.name}' is ambiguous - ${uniqueSubjects.length} component sets match; pass a nodeId or a narrower glob`,
      true,
      {
        candidates: uniqueSubjects.map((s) => ({ id: s.id, name: s.name })),
      },
    );
  }
  return {
    // Exactly one, proven by the two guards above - so this needs no cast.
    subject: uniqueSubjects[0],
    origin: null,
  };
}
