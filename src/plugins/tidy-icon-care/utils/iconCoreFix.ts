import {
  FLATTENING_ERROR_COLOR,
  OUTLINE_ERROR_COLOR,
  SETTING_CONSTRAINTS_ERROR_COLOR,
} from "./constants";
import { vectorToOutline } from "./vectorToOutline";

export function iconCoreFix(
  node: SceneNode,
  iconSize: number,
  scaleIconContent: boolean,
): ComponentNode {
  let workingNode: ComponentNode;

  if (node.type === "COMPONENT") {
    const instance = node.createInstance();
    instance.x = node.x;
    instance.y = node.y;
    workingNode = groupToComponent(instance.detachInstance(), iconSize);
    node.remove();
  } else {
    workingNode = groupToComponent(node, iconSize);
  }

  outlineVectors(workingNode);
  const flattened = unionAndFlatten(workingNode);
  resizeIconContent(flattened, iconSize, scaleIconContent);
  return flattened;
}

function outlineVectors(node: ComponentNode) {
  const vectorNodes = node.findAllWithCriteria({
    types: [
      "VECTOR",
      "ELLIPSE",
      "POLYGON",
      "RECTANGLE",
      "STAR",
      "TEXT",
      "BOOLEAN_OPERATION",
    ],
  });

  vectorNodes.forEach((vector) => {
    if (vector.name === "ic") return;

    if (
      (vector.fills as readonly Paint[]).length === 0 &&
      (vector.strokes as readonly Paint[]).length === 0
    ) {
      vector.remove();
      return;
    }

    if (vector.type === "BOOLEAN_OPERATION" && vector.children.length === 1)
      return;

    try {
      vectorToOutline(vector as any);
    } catch (error) {
      console.error("❌ Failed to outline vector", error);
      setErrorBackground(node, "outline");
    }
  });
}

function unionAndFlatten(node: ComponentNode) {
  try {
    const booleanChildren = node.findAllWithCriteria({
      types: ["BOOLEAN_OPERATION"],
    });

    if (booleanChildren.length === 0) {
      figma.union(node.children as VectorNode[], node);
    }
  } catch (error) {
    console.error("❌ Union error", error);
    setErrorBackground(node, "unite");
  }

  try {
    figma.flatten(node.children as VectorNode[]);
  } catch (error) {
    console.error("❌ Flatten error", error);
    setErrorBackground(node, "flatten");
  }

  return node;
}

function groupToComponent(node: SceneNode, iconSize: number): ComponentNode {
  const wrapper = figma.createComponent();
  wrapper.name = node.name;
  wrapper.resize(iconSize, iconSize);
  wrapper.x = node.x;
  wrapper.y = node.y;
  node.parent?.appendChild(wrapper);

  if (
    "children" in node &&
    node.children.length > 1 &&
    node.type !== "BOOLEAN_OPERATION"
  ) {
    node.children.forEach((child) => {
      const { x, y } = child;
      wrapper.appendChild(child);
      child.x = x;
      child.y = y;
    });
    ungroupNode(
      node as FrameNode | GroupNode | ComponentNode | ComponentSetNode,
    );
  } else {
    wrapper.appendChild(node);
  }

  wrapper.fills = [];
  wrapper
    .findAllWithCriteria({ types: ["FRAME", "GROUP"] })
    .forEach((group) => ungroupNode(group as FrameNode | GroupNode));

  return wrapper;
}

function ungroupNode(
  node: FrameNode | GroupNode | ComponentNode | ComponentSetNode,
) {
  if (!node || node.removed) return;
  if (!node.parent) return;
  if (!("children" in node)) return;
  try {
    figma.ungroup(node as FrameNode | GroupNode);
  } catch (error) {
    console.warn("⚠️ Unable to ungroup node", error);
  }
}

function resizeIconContent(
  node: ComponentNode,
  iconSize: number,
  scaleIconContent: boolean,
) {
  const content = node.children[0];
  if (
    !content ||
    (content.type !== "VECTOR" && content.type !== "BOOLEAN_OPERATION")
  ) {
    return;
  }

  if (content.type === "BOOLEAN_OPERATION" && content.children) {
    content.children.forEach((child) => {
      if (child.type === "VECTOR") {
        child.constraints = { horizontal: "MIN", vertical: "MIN" };
      }
    });
  }

  content.name = "ic";

  if (scaleIconContent) {
    const targetSize = getScaleFactor(iconSize);
    const largestSide = Math.max(content.width, content.height);
    if (largestSide > 0 && targetSize > 0) {
      const scale = targetSize / largestSide;
      content.resize(content.width * scale, content.height * scale);
    }
  }

  content.x = node.width / 2 - content.width / 2;
  content.y = node.height / 2 - content.height / 2;

  if (content.type === "VECTOR") {
    content.constraints = { horizontal: "SCALE", vertical: "SCALE" };
  }
}

function getScaleFactor(iconSize: number) {
  const map: Record<number, number> = {
    16: 14,
    24: 20,
    32: 26,
    48: 40,
  };
  return map[iconSize] ?? iconSize;
}

function setErrorBackground(
  node: ComponentNode,
  type: "outline" | "unite" | "flatten",
) {
  if (type === "outline") {
    node.fills = [{ type: "SOLID", color: OUTLINE_ERROR_COLOR }];
  } else if (type === "unite") {
    node.fills = [{ type: "SOLID", color: FLATTENING_ERROR_COLOR }];
  } else if (type === "flatten") {
    node.fills = [{ type: "SOLID", color: SETTING_CONSTRAINTS_ERROR_COLOR }];
  }
}
