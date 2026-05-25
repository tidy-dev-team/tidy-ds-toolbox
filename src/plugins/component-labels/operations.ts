// Operation handlers for the Component Labels module. Registered into the
// global Operation registry at module load (via src/shared/operations/register-all.ts).

import { ErrorCode, OperationError } from "../../shared/operations/errors";
import { registerOperation } from "../../shared/operations/registry";
import { findAllVariantProps } from "./utils/getVariantProps";
import { executeBuildLabels } from "./logic";
import { LabelConfig, VariantProperty } from "./types";

/**
 * Resolve the target component set from an optional nodeId, falling back to
 * the current selection. Throws typed errors if the target is missing or
 * not a component set.
 */
async function resolveComponentSet(
  nodeId: string | undefined,
): Promise<ComponentSetNode> {
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
    if (node.type !== "COMPONENT_SET") {
      throw new OperationError(
        ErrorCode.WRONG_NODE_TYPE,
        `node ${nodeId} is ${node.type}, expected COMPONENT_SET`,
        true,
        { nodeId, type: node.type },
      );
    }
    return node;
  }

  const selection = figma.currentPage.selection;
  if (selection.length === 0) {
    throw new OperationError(
      ErrorCode.INVALID_PARAMS,
      "no nodeId provided and nothing is selected — select a component set or pass nodeId",
    );
  }
  const first = selection[0];
  if (first.type !== "COMPONENT_SET") {
    throw new OperationError(
      ErrorCode.WRONG_NODE_TYPE,
      `selected node is ${first.type}, expected COMPONENT_SET`,
      true,
      { nodeId: first.id, type: first.type },
    );
  }
  return first;
}

interface GetVariantPropsParams {
  nodeId?: string;
}
interface GetVariantPropsResult {
  nodeId: string;
  name: string;
  variantProps: Record<string, VariantProperty>;
}

registerOperation<GetVariantPropsParams, GetVariantPropsResult>(
  {
    id: "tidy_component_labels_get_variant_props",
    kind: "query",
    module: "component-labels",
    summary:
      "Inspect a component set and return its variant properties (name, options, default). Accepts an explicit nodeId or falls back to the current selection. Errors if the target isn't a component set.",
    paramsExample: { nodeId: "1:2" },
  },
  async (params) => {
    const set = await resolveComponentSet(params.nodeId);
    return {
      nodeId: set.id,
      name: set.name,
      variantProps: findAllVariantProps(set),
    };
  },
);

interface BuildLabelsParams {
  nodeId?: string;
  labels: LabelConfig;
  spacing?: number;
  fontSize?: number;
  extractElement?: boolean;
}
interface BuildLabelsResult {
  nodeId: string;
  name: string;
}

const LABEL_AXES = ["top", "left", "secondTop", "secondLeft"] as const;

registerOperation<BuildLabelsParams, BuildLabelsResult>(
  {
    id: "tidy_component_labels_build",
    kind: "execute",
    module: "component-labels",
    summary:
      "Build variant labels around a component set's top and left edges. Accepts an explicit nodeId or falls back to the current selection. Errors if the target isn't a component set or if any axis references an unknown variant property.",
    paramsExample: {
      labels: {
        top: "Size",
        left: "State",
        secondTop: "",
        secondLeft: "",
        groupSecondTop: false,
        groupSecondLeft: false,
      },
    },
  },
  async (params) => {
    if (!params.labels || typeof params.labels !== "object") {
      throw new OperationError(
        ErrorCode.INVALID_PARAMS,
        "labels object is required",
      );
    }

    const set = await resolveComponentSet(params.nodeId);
    const propNames = new Set(Object.keys(findAllVariantProps(set)));

    const invalid: { axis: string; value: string }[] = [];
    for (const axis of LABEL_AXES) {
      const value = params.labels[axis];
      if (value && !propNames.has(value)) {
        invalid.push({ axis, value });
      }
    }
    if (invalid.length) {
      throw new OperationError(
        ErrorCode.INVALID_PARAMS,
        `${invalid.length} axis label(s) reference unknown variant properties`,
        true,
        { invalid, availableProps: [...propNames] },
      );
    }

    await executeBuildLabels(set, {
      labels: {
        top: params.labels.top ?? "",
        left: params.labels.left ?? "",
        secondTop: params.labels.secondTop ?? "",
        secondLeft: params.labels.secondLeft ?? "",
        groupSecondTop: Boolean(params.labels.groupSecondTop),
        groupSecondLeft: Boolean(params.labels.groupSecondLeft),
      },
      spacing: typeof params.spacing === "number" ? params.spacing : 16,
      fontSize: typeof params.fontSize === "number" ? params.fontSize : 12,
      extractElement: Boolean(params.extractElement),
    });

    return { nodeId: set.id, name: set.name };
  },
);
