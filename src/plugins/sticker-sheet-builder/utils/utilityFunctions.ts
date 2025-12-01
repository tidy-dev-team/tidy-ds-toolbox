export async function findMasterComponent(node: InstanceNode) {
  const immediateMaster = await node.getMainComponentAsync();
  const masterParent = immediateMaster?.parent;
  const trueMaster =
    masterParent?.type === "COMPONENT_SET" ? masterParent : immediateMaster;
  return trueMaster;
}

export function setVariantProps(
  node: InstanceNode,
  name: string,
  value: string,
) {
  const propList = node.componentProperties;
  for (const property in propList) {
    if (property.includes(`${name}`) && propList[property].type === "VARIANT") {
      try {
        const newProps: { [key: string]: string } = {};
        newProps[property] = value;
        node.setProperties(newProps);
      } catch (error) {
        console.warn(
          `Failed to set variant property ${property}=${value} on node ${node.name}`,
        );
      }
    }
  }
}

export function setBooleanProps(
  element: InstanceNode,
  name: string,
  value: boolean,
) {
  const propList = element.componentProperties;
  for (const property in propList) {
    if (property.includes(`${name}`)) {
      try {
        const newProps: any = {};
        newProps[property] = value;
        element.setProperties(newProps);
      } catch (error) {
        console.warn(
          `Failed to set boolean property ${property}=${value} on node ${element.name}`,
        );
      }
    }
  }
}

export function buildAutoLayoutFrame(
  name: string,
  direction: "NONE" | "HORIZONTAL" | "VERTICAL",
  paddingHorizontal = 20,
  paddingVertical = 20,
  itemSpacing = 10,
): FrameNode {
  const frame = figma.createFrame();
  frame.layoutMode = direction;
  frame.paddingBottom = paddingVertical;
  frame.paddingLeft = paddingHorizontal;
  frame.paddingRight = paddingHorizontal;
  frame.paddingTop = paddingVertical;
  frame.itemSpacing = itemSpacing;
  frame.counterAxisSizingMode = "AUTO";
  frame.name = name;
  return frame;
}

export function placeResultTopRight(
  resultFrame: FrameNode,
  page: PageNode = figma.currentPage,
) {
  const bounds = computePageBounds(Array.from(page.children));
  page.appendChild(resultFrame);
  resultFrame.x = bounds.hasNodes ? bounds.bottomRight.x + 100 : 0;
  resultFrame.y = bounds.hasNodes ? bounds.topLeft.y : 0;

  figma.viewport.scrollAndZoomIntoView([resultFrame]);
}

function computePageBounds(nodes: readonly SceneNode[]) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let hasNodes = false;

  for (const node of nodes) {
    if (!("width" in node) || !("height" in node)) {
      continue;
    }

    const transform = node.absoluteTransform;
    const nodeX = transform[0][2];
    const nodeY = transform[1][2];
    const width = node.width ?? 0;
    const height = node.height ?? 0;

    if (!Number.isFinite(nodeX) || !Number.isFinite(nodeY)) {
      continue;
    }

    minX = Math.min(minX, nodeX);
    minY = Math.min(minY, nodeY);
    maxX = Math.max(maxX, nodeX + width);
    maxY = Math.max(maxY, nodeY + height);
    hasNodes = true;
  }

  return {
    topLeft: {
      x: Number.isFinite(minX) ? minX : 0,
      y: Number.isFinite(minY) ? minY : 0,
    },
    bottomRight: {
      x: Number.isFinite(maxX) ? maxX : 0,
      y: Number.isFinite(maxY) ? maxY : 0,
    },
    hasNodes,
  };
}
