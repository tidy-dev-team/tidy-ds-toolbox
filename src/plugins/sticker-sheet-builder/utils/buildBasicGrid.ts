import { createSubSectionTitle, createElementLabelText } from "./textUtils";
import { buildAutoLayoutFrame, setVariantProps } from "./utilityFunctions";
export default function buildBasicGrid(
  node: any,
  firstProps: any[] | null,
  secondProps: any[] | null,
) {
  if (firstProps?.length && secondProps?.length) {
    const [firstPropName, { variantOptions: firstOptions }] = firstProps;
    const [secondPropName, { variantOptions: secondOptions }] = secondProps;

    if (!node) return;
    const basicGrid = buildGrid(
      firstPropName,
      firstOptions,
      secondPropName,
      secondOptions,
      node,
    );
    return basicGrid;
  } else {
    const currentProp = getNonEmptyProp(firstProps, secondProps);
    if (!currentProp) return;
    const workingNode = node.createInstance();
    const [currentPropName, { variantOptions }] = currentProp;
    const basicGrid = buildStates(
      null,
      currentPropName,
      currentPropName,
      variantOptions,
      workingNode,
    );
    workingNode.remove();
    return basicGrid;
  }
}

function getNonEmptyProp(firstProps: any[] | null, secondProps: any[] | null) {
  if (firstProps && firstProps.length) return firstProps;
  return secondProps;
}

function buildGrid(
  firstPropName: string,
  firstOptions: string[],
  secondPropName: string,
  secondOptions: string[],
  node: any,
) {
  const workingNode = node.createInstance();
  const typeFrame = createNormalizedFrame("type-frame", "VERTICAL", 0, 0, 36);
  for (const type of firstOptions) {
    const stateFrame = buildStates(
      firstPropName,
      type,
      secondPropName,
      secondOptions,
      workingNode,
    );
    typeFrame.appendChild(stateFrame);
  }
  workingNode.remove();
  return typeFrame;
}

function buildStates(
  firstPropName: string | null,
  currentFirstProp: string | null,
  secondPropName: string,
  secondOptions: string[],
  node: any,
) {
  if (firstPropName && currentFirstProp)
    setVariantProps(node, firstPropName, currentFirstProp);
  const stateWithTitle = createNormalizedFrame(
    "state-frame",
    "VERTICAL",
    0,
    0,
    20,
  );
  const titleLabel = firstPropName + " - " + currentFirstProp;
  const title = currentFirstProp ? createSubSectionTitle(titleLabel) : null;
  if (title) stateWithTitle.appendChild(title);
  const elementsFrame = createNormalizedFrame(
    "elements-frame",
    "HORIZONTAL",
    0,
    0,
    16,
  );
  stateWithTitle.appendChild(elementsFrame);
  for (const state of secondOptions) {
    const nodeWithLabel = createNormalizedFrame(
      "one-state-frame",
      "VERTICAL",
      0,
      0,
      8,
    );
    const cloNode = node.clone();
    setVariantProps(cloNode, secondPropName, state ?? secondOptions[0]);
    nodeWithLabel.appendChild(cloNode);
    const label = createElementLabelText(state);
    nodeWithLabel.appendChild(label);
    nodeWithLabel.counterAxisAlignItems = "CENTER";
    elementsFrame.appendChild(nodeWithLabel);
  }
  return stateWithTitle;
}

function normalizeFrame(frame: FrameNode) {
  frame.fills = [];
  frame.clipsContent = false;
}

export function createNormalizedFrame(
  name: string,
  direction: "VERTICAL" | "HORIZONTAL",
  paddingHorizontal: number,
  paddingVertical: number,
  spacing: number,
): FrameNode {
  const frame = buildAutoLayoutFrame(
    name,
    direction,
    paddingHorizontal,
    paddingVertical,
    spacing,
  );
  normalizeFrame(frame);
  return frame;
}
