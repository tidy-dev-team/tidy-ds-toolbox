import { addComponentDescription } from "./addComponentDescription";
import { attachLabelToIcon } from "./attachLabelToIcon";
import { getSelectionGroupCoordinates } from "./getSelectionGroupCoordinates";
import { iconCoreFix } from "./iconCoreFix";
import { TidyIconCareSettings } from "../types";

export async function buildIconGrid(settings: TidyIconCareSettings) {
  await figma.loadFontAsync({ family: "Inter", style: "Regular" });

  const selection = figma.currentPage.selection;
  if (!selection.length) {
    throw new Error("Select at least one icon or component to build the grid");
  }

  const coords = getSelectionGroupCoordinates(selection);
  const labelComponent = createLabelComponent();
  const parent = selection[0].parent;
  const sortedNodes = [...selection].sort((a, b) =>
    a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
  );

  const columns = chunk(sortedNodes, Math.max(settings.rows, 1));
  const gridFrame = createGridFrame();

  columns.forEach((columnNodes) => {
    const column = createColumnFrame();
    columnNodes.forEach((node) => {
      const iconPlusLabel = attachLabelToIcon(
        node,
        settings.iconSpacing,
        labelComponent,
        settings.labelCase,
      );
      iconPlusLabel.name = "icon+label";
      column.appendChild(iconPlusLabel);
    });
    column.itemSpacing = settings.rowSpacing;
    gridFrame.appendChild(column);
  });

  gridFrame.itemSpacing = settings.columnSpacing;
  parent?.appendChild(gridFrame);
  gridFrame.x = coords.x;
  gridFrame.y = coords.y;

  const opacityValue = Math.min(Math.max(settings.opacity, 0), 100) / 100;
  const hex = sanitizeHex(settings.hexColor);
  const hexWithOpacity = addOpacityToHex(hex, opacityValue);

  for (const icon of selection) {
    let workingNode: SceneNode | ComponentNode = icon;

    if (icon.type === "INSTANCE") {
      workingNode = icon.detachInstance();
    }

    const container = workingNode.parent;

    if (workingNode.type === "COMPONENT_SET") {
      const fixedSet = handleComponentSet(
        workingNode,
        settings,
        hexWithOpacity,
      );
      if (container) {
        container.insertChild(0, fixedSet);
      }
      continue;
    }

    const fixedNode = iconCoreFix(
      workingNode,
      settings.iconSize,
      settings.scaleIconContent,
    );

    if (settings.addMetaData) {
      addComponentDescription([fixedNode], {
        includeStatus: true,
        includeGuidelines: true,
        includeMisprint: true,
        mode: "replace",
        status: "🟣 To do",
        hexColor: hex,
      });
    }

    if (!settings.preserveColors) {
      recolorNodes(fixedNode, hexWithOpacity);
    }

    container?.insertChild(0, fixedNode);
  }

  labelComponent.remove();
}

function sanitizeHex(value: string) {
  return value.replace("#", "").toUpperCase();
}

function createLabelComponent() {
  const component = figma.createComponent();
  component.layoutMode = "HORIZONTAL";
  component.layoutSizingVertical = "HUG";
  component.name = "label";
  const text = figma.createText();
  text.characters = "Label";
  component.appendChild(text);
  return component;
}

function createGridFrame() {
  const frame = figma.createFrame();
  frame.layoutPositioning = "AUTO";
  frame.layoutMode = "HORIZONTAL";
  frame.counterAxisAlignItems = "MIN";
  frame.counterAxisSizingMode = "AUTO";
  frame.name = "icon frame";
  return frame;
}

function createColumnFrame() {
  const frame = figma.createFrame();
  frame.layoutPositioning = "AUTO";
  frame.layoutMode = "VERTICAL";
  frame.counterAxisAlignItems = "MIN";
  frame.counterAxisSizingMode = "AUTO";
  frame.name = "icon column";
  return frame;
}

function chunk<T>(items: readonly T[], size: number) {
  const safeSize = Math.max(1, size);
  const output: T[][] = [];
  for (let i = 0; i < items.length; i += safeSize) {
    output.push(items.slice(i, i + safeSize));
  }
  return output;
}

function addOpacityToHex(hex: string, opacity: number) {
  const clamped = Math.max(0, Math.min(1, opacity));
  const alpha = Math.round(clamped * 255)
    .toString(16)
    .padStart(2, "0");
  return `${hex}${alpha}`;
}

function handleComponentSet(
  node: ComponentSetNode,
  settings: TidyIconCareSettings,
  hexWithOpacity: string,
) {
  const property = Object.keys(node.componentPropertyDefinitions)[0];
  const variants = node.children;
  const fixedVariants: ComponentNode[] = [];

  variants.forEach((variant) => {
    const fixedVariant = iconCoreFix(
      variant,
      settings.iconSize,
      settings.scaleIconContent,
    );
    if (!settings.preserveColors) {
      recolorNodes(fixedVariant, hexWithOpacity);
    }
    const nameSuffix = variant.name.split("/").pop();
    fixedVariant.name = property ? `${property}=${nameSuffix}` : variant.name;
    fixedVariants.push(fixedVariant);
  });

  const newSet = figma.combineAsVariants(fixedVariants, figma.currentPage);
  newSet.layoutMode = "VERTICAL";
  newSet.strokeWeight = 1;
  newSet.name = node.name;
  newSet.strokes = [
    {
      type: "SOLID",
      visible: true,
      opacity: 1,
      blendMode: "NORMAL",
      color: {
        r: 0.5921568870544434,
        g: 0.27843138575553894,
        b: 1,
      },
      boundVariables: {},
    },
  ];

  return newSet;
}

function recolorNodes(node: ComponentNode | SceneNode, hexWithOpacity: string) {
  const visit = (current: SceneNode) => {
    if (
      "fills" in current &&
      Array.isArray(current.fills) &&
      current.fills.length
    ) {
      applyVectorColor(
        current as RectangleNode | VectorNode,
        "fills",
        hexWithOpacity,
      );
    }
    if (
      "strokes" in current &&
      Array.isArray(current.strokes) &&
      current.strokes.length
    ) {
      applyVectorColor(
        current as RectangleNode | VectorNode,
        "strokes",
        hexWithOpacity,
      );
    }

    if ("children" in current) {
      current.children.forEach((child) => visit(child as SceneNode));
    }
  };

  if ("children" in node) {
    node.children.forEach((child) => visit(child as SceneNode));
  }
}

function applyVectorColor(
  node: RectangleNode | VectorNode,
  property: "fills" | "strokes",
  hexWithOpacity: string,
) {
  const paints = (node as any)[property] as Paint[];
  if (!paints || !paints.length || paints[0].type !== "SOLID") {
    return;
  }

  try {
    figma.variables.setBoundVariableForPaint(paints[0], "color", null);
  } catch {
    // Variable API might not be available; ignore gracefully
  }

  const nextPaint = figma.util.solidPaint(`#${hexWithOpacity}`, paints[0]);
  (node as any)[property] = [nextPaint];
}
