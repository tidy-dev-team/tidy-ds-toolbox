import { createNormalizedFrame } from "./buildBasicGrid";
import { setVariantProps } from "./utilityFunctions";
import { createSubSectionTitle, createElementLabelText } from "./textUtils";

export default function buildSizes(
  node: ComponentNode,
  [sizePropName, { variantOptions: sizeOptions }]: any,
) {
  const workingNode = node.createInstance();
  const sizeFrame = createNormalizedFrame("size-frame", "VERTICAL", 0, 0, 20);
  const title = createSubSectionTitle("size");
  sizeFrame.appendChild(title);
  const elementsFrame = createNormalizedFrame(
    "elements-frame",
    "HORIZONTAL",
    0,
    0,
    100,
  );
  elementsFrame.counterAxisAlignItems = "MAX";
  for (const prop of sizeOptions) {
    const nodeWithLabel = createNormalizedFrame(
      "one-state-frame",
      "VERTICAL",
      0,
      0,
      8,
    );
    const cloNode = workingNode.clone();
    setVariantProps(cloNode, sizePropName, prop);
    nodeWithLabel.appendChild(cloNode);
    const label = createElementLabelText(prop);
    nodeWithLabel.appendChild(label);
    nodeWithLabel.counterAxisAlignItems = "CENTER";
    elementsFrame.appendChild(nodeWithLabel);
  }
  sizeFrame.appendChild(elementsFrame);
  workingNode.remove();
  return sizeFrame;
}
