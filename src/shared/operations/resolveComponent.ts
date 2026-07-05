/// <reference types="@figma/plugin-typings" />

// Selection/id fallback (ADR-0001): resolve an Operation's target node from
// an optional explicit id, falling back to the current Figma selection.
// Extracted from the near-identical resolvers duplicated in
// component-labels/operations.ts and tidy-doc/operations.ts.

import { ErrorCode, OperationError } from "./errors";

type ComponentLike = ComponentNode | ComponentSetNode;

function typeName<T extends ComponentLike["type"]>(types: readonly T[]): string {
  return types.join(" or ");
}

/**
 * Resolves `nodeId` (if given) or the sole current selection to a node whose
 * type is one of `allowedTypes`. Throws a typed OperationError otherwise.
 */
export async function resolveComponentByIdOrSelection<
  T extends ComponentLike["type"],
>(
  nodeId: string | undefined,
  allowedTypes: readonly T[],
): Promise<Extract<ComponentLike, { type: T }>> {
  const expected = typeName(allowedTypes);

  if (nodeId) {
    const node = await figma.getNodeByIdAsync(nodeId);
    if (!node) {
      throw new OperationError(
        ErrorCode.NOT_FOUND,
        `node ${nodeId} not found`,
        true,
        { nodeId },
      );
    }
    if (!allowedTypes.includes(node.type as T)) {
      throw new OperationError(
        ErrorCode.WRONG_NODE_TYPE,
        `node ${nodeId} is ${node.type}, expected ${expected}`,
        true,
        { nodeId, type: node.type },
      );
    }
    return node as Extract<ComponentLike, { type: T }>;
  }

  const selection = figma.currentPage.selection;
  if (selection.length === 0) {
    throw new OperationError(
      ErrorCode.INVALID_PARAMS,
      `no nodeId provided and nothing is selected — select a ${expected} or pass nodeId`,
    );
  }
  const first = selection[0];
  if (!allowedTypes.includes(first.type as T)) {
    throw new OperationError(
      ErrorCode.WRONG_NODE_TYPE,
      `selected node is ${first.type}, expected ${expected}`,
      true,
      { nodeId: first.id, type: first.type },
    );
  }
  return first as Extract<ComponentLike, { type: T }>;
}
