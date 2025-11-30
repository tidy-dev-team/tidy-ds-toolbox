import { findMasterComponent } from "./utilityFunctions";

export async function getMainComponent(
  node: InstanceNode | ComponentNode | ComponentSetNode
) {
  let mainComponent = null;
  switch (node.type) {
    case "COMPONENT":
      if (node.parent && node.parent.type === "COMPONENT_SET") {
        mainComponent = node.parent;
      } else {
        mainComponent = node;
      }
      break;
    case "COMPONENT_SET":
      mainComponent = node;
      break;
    case "INSTANCE":
      mainComponent = await findMasterComponent(node);
      break;
    default:
      return null;
  }
  return mainComponent;
}
