/// <reference types="@figma/plugin-typings" />

import { addNewTextProperty } from "./componentPropertyHelpers";
import { INTERNAL_TOOLS_PAGE, DS_SIZE_MARKER } from "./constants";
import { getColorStyles } from "./colorStyles";

const emptyFill: SolidPaint[] = [
  {
    type: "SOLID",
    visible: false,
    opacity: 1,
    blendMode: "NORMAL",
    color: {
      r: 1,
      g: 1,
      b: 1,
    },
  },
];

function createSizeMarkerLines(position: string, colors: any): FrameNode {
  const frame = figma.createFrame();
  frame.fills = emptyFill;
  frame.strokeStyleId = colors.dsWhite.id;
  const line = figma.createLine();
  frame.appendChild(line);
  line.strokeWeight = 1;
  line.strokeStyleId = colors.dsWhite.id;

  if (position === "top" || position === "bottom") {
    frame.strokeLeftWeight = 1;
    frame.strokeRightWeight = 1;
    line.constraints = {
      horizontal: "STRETCH",
      vertical: "CENTER",
    };
    line.y = 50;
    frame.resize(16, 5);
  }

  if (position === "left" || position === "right") {
    frame.strokeTopWeight = 1;
    frame.strokeBottomWeight = 1;
    line.constraints = {
      horizontal: "CENTER",
      vertical: "STRETCH",
    };
    line.rotation = 90;
    frame.resize(5, 15);
    line.x = 3;
    line.y = 15;
  }

  frame.strokeStyleId = colors.dsPink500.id;
  line.strokeStyleId = colors.dsPink500.id;
  frame.name = `${DS_SIZE_MARKER}-marker`;
  frame.layoutAlign = "STRETCH";

  return frame;
}

function createSizeMarkerText(size: string, colors: any): TextNode {
  const meterValue = figma.createText();
  meterValue.fontSize = 14;
  meterValue.fontName = {
    family: "Inter",
    style: "Regular",
  };
  meterValue.characters = `${size}`;
  meterValue.fillStyleId = colors.dsWhite.id;
  meterValue.name = `${DS_SIZE_MARKER}-value`;
  meterValue.layoutAlign = "INHERIT";
  meterValue.textAlignHorizontal = "CENTER";
  meterValue.fillStyleId = colors.dsGray900.id;
  return meterValue;
}

function createSizeMarkerMeter(
  size: string,
  position: string,
  colors: any,
): FrameNode {
  const meter = figma.createFrame();
  const marker = createSizeMarkerLines(position, colors);
  const value = createSizeMarkerText(size, colors);

  meter.layoutPositioning = "AUTO";
  meter.itemSpacing = 0;
  meter.layoutAlign = "STRETCH";
  meter.layoutGrow = 0;
  meter.layoutMode = "VERTICAL";
  meter.counterAxisAlignItems = "CENTER";

  if (position === "top") {
    meter.appendChild(value);
    meter.appendChild(marker);
    meter.paddingBottom = 8;
  }
  if (position === "bottom") {
    meter.appendChild(marker);
    meter.appendChild(value);
    meter.paddingTop = 8;
  }
  if (position === "left") {
    meter.layoutMode = "HORIZONTAL";
    meter.appendChild(value);
    meter.appendChild(marker);
    meter.paddingRight = 8;
  }
  if (position === "right") {
    meter.layoutMode = "HORIZONTAL";
    meter.appendChild(marker);
    meter.appendChild(value);
    meter.paddingLeft = 8;
  }

  meter.itemSpacing = 4;

  meter.name = `${DS_SIZE_MARKER}-element`;
  meter.fills = emptyFill;
  meter.clipsContent = false;

  return meter;
}

function createSizeMarker(
  size: string,
  position: string,
  colors: any,
): ComponentNode {
  const spacingMarker = figma.createComponent();

  spacingMarker.layoutPositioning = "AUTO";
  spacingMarker.layoutAlign = "STRETCH";

  const meter = createSizeMarkerMeter(size, position, colors);

  if (position === "top") {
    spacingMarker.name = "position=top";
    spacingMarker.appendChild(meter);
  }
  if (position === "bottom") {
    spacingMarker.name = "position=bottom";
    spacingMarker.appendChild(meter);
  }
  if (position === "left") {
    spacingMarker.name = "position=left";
    spacingMarker.appendChild(meter);
  }
  if (position === "right") {
    spacingMarker.name = "position=right";
    spacingMarker.appendChild(meter);
  }

  if (position === "top" || position === "bottom") {
    spacingMarker.layoutMode = "VERTICAL";
  }
  if (position === "left" || position === "right") {
    spacingMarker.layoutMode = "HORIZONTAL";
  }

  const valueText = meter.children.find(
    (node) => node.type === "TEXT",
  ) as TextNode;
  if (valueText) {
    addNewTextProperty(spacingMarker, valueText, "text", "16");
  }

  return spacingMarker;
}

export function buildSizeMarkers(): ComponentSetNode {
  const colors = getColorStyles();
  const toolsPage = figma.root.findChild(
    (node) => node.name === INTERNAL_TOOLS_PAGE,
  ) as PageNode;

  if (!toolsPage) {
    throw new Error("Internal tools page not found");
  }

  const spacingTop = createSizeMarker("16", "top", colors);
  const spacingBottom = createSizeMarker("16", "bottom", colors);
  const spacingLeft = createSizeMarker("16", "left", colors);
  const spacingRight = createSizeMarker("16", "right", colors);

  const spacings = [spacingTop, spacingBottom, spacingLeft, spacingRight];
  spacings.forEach((node) => toolsPage.appendChild(node));

  const spacingComponentSet = figma.combineAsVariants(spacings, toolsPage);

  spacingComponentSet.name = DS_SIZE_MARKER;
  spacingComponentSet.x = 900;
  spacingComponentSet.y = 1320;
  spacingComponentSet.layoutPositioning = "AUTO";
  spacingComponentSet.layoutMode = "HORIZONTAL";
  spacingComponentSet.itemSpacing = 20;
  spacingComponentSet.fillStyleId = colors.dsWhite.id;
  spacingComponentSet.paddingBottom = 20;
  spacingComponentSet.paddingTop = 20;
  spacingComponentSet.paddingLeft = 20;
  spacingComponentSet.paddingRight = 20;
  spacingComponentSet.cornerRadius = 28;

  return spacingComponentSet;
}
