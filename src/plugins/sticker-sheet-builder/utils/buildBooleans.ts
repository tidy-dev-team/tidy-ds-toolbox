import { createNormalizedFrame } from "./buildBasicGrid";
import { createElementLabelText, createSubSectionTitle } from "./textUtils";
import { setBooleanProps } from "./utilityFunctions";
export function buildBooleans(
  mainComponent: ComponentNode | ComponentSetNode,
  defaultVariant: ComponentNode,
  booleanProps: any
) {
  if (!Object.keys(booleanProps).length) return;

  let workingNode: InstanceNode;

  const allBooleansFrame = createNormalizedFrame(
    "all-booleans-frame",
    "VERTICAL",
    0,
    0,
    60
  );

  for (const prop in booleanProps) {
    const isProp = isPropertyOnThisVariant(prop, defaultVariant);
    workingNode = defaultVariant.createInstance();

    if (!isProp && mainComponent.type === "COMPONENT_SET") {
      const found = mainComponent.findChild((node) => {
        if (node.type !== "COMPONENT") return false;
        const hasProperty = isPropertyOnThisVariant(prop, node);
        return hasProperty;
      });

      if (found) {
        workingNode.remove();
        workingNode = (found as ComponentNode).createInstance();
      }
    }

    const cleanPropName = prop.split("#")[0];
    const oneBooleanFrame = createNormalizedFrame(
      `${cleanPropName}-frame`,
      "VERTICAL",
      0,
      0,
      60
    );
    const title = createSubSectionTitle(cleanPropName);
    oneBooleanFrame.appendChild(title);
    const elementsFrame = createNormalizedFrame(
      "elements-frame",
      "HORIZONTAL",
      0,
      0,
      16
    );
    oneBooleanFrame.appendChild(elementsFrame);
    elementsFrame.counterAxisAlignItems = "MAX";

    const nodeWithLabelFalse = buildBooleanStateFrame(
      workingNode,
      prop,
      false,
      "off"
    );
    elementsFrame.appendChild(nodeWithLabelFalse);
    const nodeWithLabelTrue = buildBooleanStateFrame(
      workingNode,
      prop,
      true,
      "on"
    );
    elementsFrame.appendChild(nodeWithLabelTrue);
    allBooleansFrame.appendChild(oneBooleanFrame);
    workingNode.remove();
  }

  return allBooleansFrame;
}

function isPropertyOnThisVariant(
  propertyName: string,
  node: InstanceNode | ComponentNode | FrameNode
) {
  for (const element of node.children) {
    if (element.componentPropertyReferences?.visible === propertyName) {
      return true;
    }
  }
  return false;
}
function buildBooleanStateFrame(
  workingNode: InstanceNode,
  prop: string,
  booleanState: boolean,
  booleanStateLabel: string
) {
  const nodeWithLabel = createNormalizedFrame(
    "one-state-frame",
    "VERTICAL",
    0,
    0,
    8
  );
  const cloNode = workingNode.clone();
  setBooleanProps(cloNode, prop, booleanState);
  nodeWithLabel.appendChild(cloNode);
  const label = createElementLabelText(booleanStateLabel);
  nodeWithLabel.appendChild(label);
  nodeWithLabel.counterAxisAlignItems = "CENTER";
  return nodeWithLabel;
}
