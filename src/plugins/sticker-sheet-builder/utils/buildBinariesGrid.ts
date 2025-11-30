import { setVariantProps } from "./utilityFunctions";
import { createSubSectionTitle, createElementLabelText } from "./textUtils";
import { createNormalizedFrame } from "./buildBasicGrid";
export default function buildBinariesGrids(node: any, binaryProps: any[]) {
  const binaryPropertyFrames: FrameNode[] = [];

  for (const propArray of binaryProps) {
    const [propName, { variantOptions: binaryOptions }] = propArray;
    const workingNode = node.createInstance();
    const binaryFrame = createNormalizedFrame(
      `${propName}-frame`,
      "VERTICAL",
      0,
      0,
      20
    );
    const title = createSubSectionTitle(propName);
    binaryFrame.appendChild(title);
    const elementsFrame = createNormalizedFrame(
      "elements-frame",
      "HORIZONTAL",
      0,
      0,
      16
    );

    for (const option of binaryOptions) {
      const nodeWithLabel = createNormalizedFrame(
        "node-with-label",
        "VERTICAL",
        0,
        0,
        8
      );
      const cloNode = workingNode.clone();
      setVariantProps(cloNode, propName, option);
      nodeWithLabel.appendChild(cloNode);
      const label = createElementLabelText(option);
      nodeWithLabel.appendChild(label);
      nodeWithLabel.counterAxisAlignItems = "CENTER";
      elementsFrame.appendChild(nodeWithLabel);
    }
    binaryFrame.appendChild(elementsFrame);
    binaryPropertyFrames.push(binaryFrame);
    workingNode.remove();
  }
  return binaryPropertyFrames;
}
