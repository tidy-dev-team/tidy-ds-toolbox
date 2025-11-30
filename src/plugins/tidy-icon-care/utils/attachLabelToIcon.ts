import { LabelCase } from "../types";
import { toSentenceCase } from "./formatting";

export function attachLabelToIcon(
  icon: SceneNode,
  spacing: number,
  labelComponent: ComponentNode,
  labelCase: LabelCase
): FrameNode {
  if (icon.type !== "COMPONENT_SET") {
    const labelInstance = labelComponent.createInstance();
    const textNode = ensureTextNode(labelInstance);
    const iconText = formatIconText(icon.name, labelCase);
    icon.name = iconText;
    textNode.characters = iconText;
    styleLabel(textNode);
    return composeIconWithLabel(icon, labelInstance, spacing);
  }

  const labelInstance = labelComponent.createInstance();
  const textNode = ensureTextNode(labelInstance);
  const iconText = formatIconText(icon.name, labelCase);
  icon.name = iconText;
  textNode.characters = iconText;
  styleLabel(textNode);
  configureComponentSet(icon);
  return composeIconWithLabel(icon, labelInstance, spacing);
}

function configureComponentSet(icon: ComponentSetNode) {
  icon.layoutMode = "VERTICAL";
  icon.counterAxisSizingMode = "AUTO";
  icon.counterAxisAlignItems = "MIN";
  icon.itemSpacing = 12;
  icon.paddingBottom = 8;
  icon.paddingTop = 8;
  icon.paddingLeft = 8;
  icon.paddingRight = 8;
}

function ensureTextNode(labelInstance: InstanceNode): TextNode {
  const candidate = labelInstance.findOne((child) => child.type === "TEXT");
  if (candidate && candidate.type === "TEXT") {
    return candidate;
  }

  const text = figma.createText();
  labelInstance.appendChild(text);
  return text;
}

function styleLabel(label: TextNode) {
  label.fills = [
    {
      type: "SOLID",
      visible: true,
      opacity: 1,
      blendMode: "NORMAL",
      color: {
        r: 0.04928385466337204,
        g: 0.04624933376908302,
        b: 0.04624933376908302,
      },
      boundVariables: {},
    },
  ];
}

function formatIconText(value: string, labelCase: LabelCase) {
  switch (labelCase) {
    case "uppercase":
      return value.trim().toUpperCase().replace(/\s+/g, "-");
    case "sentence":
      return toSentenceCase(value).replace(/\s+/g, "-");
    default:
      return value.trim().toLowerCase().replace(/\s+/g, "-");
  }
}

function composeIconWithLabel(
  icon: SceneNode,
  label: InstanceNode,
  spacing: number
): FrameNode {
  const frame = figma.createFrame();
  frame.layoutMode = "HORIZONTAL";
  frame.counterAxisSizingMode = "AUTO";
  frame.counterAxisAlignItems = "CENTER";
  frame.layoutPositioning = "AUTO";
  frame.itemSpacing = spacing;
  frame.fills = [];
  frame.appendChild(icon);
  frame.appendChild(label);
  return frame;
}
