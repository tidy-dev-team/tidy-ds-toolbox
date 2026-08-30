/// <reference types="@figma/plugin-typings" />

import { addNewTextProperty } from "./componentPropertyHelpers";
import { INTERNAL_TOOLS_PAGE, DS_SPACING_MARKER } from "./constants";
import { getColorStyles } from "./colorStyles";

const barColor: SolidPaint = {
  type: "SOLID",
  visible: true,
  opacity: 0.4,
  blendMode: "NORMAL",
  color: {
    r: 0.9254902005195618,
    g: 0.1764705926179886,
    b: 0.4745098054409027,
  },
};

function buildSpacingLine(): VectorNode {
  const line = figma.createVector();
  line.strokes = [
    {
      type: "SOLID",
      visible: true,
      opacity: 1,
      blendMode: "NORMAL",
      color: {
        r: 0.9833333492279053,
        g: 0.012291669845581055,
        b: 0.012291669845581055,
      },
    },
  ];
  line.strokeAlign = "CENTER";
  line.strokeCap = "ROUND";
  line.strokeJoin = "MITER";
  line.strokeMiterLimit = 4;
  line.dashPattern = [1, 2];
  line.strokeWeight = 0.5;
  line.vectorNetwork = {
    regions: [],
    segments: [
      {
        start: 0,
        end: 1,
        tangentStart: {
          x: 0,
          y: 0,
        },
        tangentEnd: {
          x: 0,
          y: 0,
        },
      },
    ],
    vertices: [
      {
        x: 40,
        y: 0,
        strokeCap: "ROUND",
        strokeJoin: "MITER",
        cornerRadius: 0,
        handleMirroring: "NONE",
      },
      {
        x: 0,
        y: 4.664075386320289e-13,
        strokeCap: "ROUND",
        strokeJoin: "MITER",
        cornerRadius: 0,
        handleMirroring: "NONE",
      },
    ],
  };
  return line;
}

function createSpacingText(size: string, colors: any): TextNode {
  const meterValue = figma.createText();
  meterValue.fontSize = 14;
  meterValue.fontName = {
    family: "Inter",
    style: "Regular",
  };
  meterValue.characters = `${size}`;
  meterValue.fillStyleId = colors.dsGray900.id;
  meterValue.name = `${DS_SPACING_MARKER}-value`;
  meterValue.layoutAlign = "INHERIT";
  meterValue.textAlignHorizontal = "CENTER";
  return meterValue;
}

function createSpacingBar(position: string): FrameNode {
  const bar = figma.createFrame();
  bar.name = `${DS_SPACING_MARKER}-bar`;
  bar.resize(16, 88);
  bar.fills = [barColor];
  bar.layoutPositioning = "AUTO";
  bar.layoutAlign = "STRETCH";
  bar.layoutMode = "VERTICAL";
  bar.layoutGrow = 1;

  if (position === "left" || position === "right") {
    bar.layoutMode = "HORIZONTAL";
  }

  return bar;
}

function createSpacingMarker(
  size: string,
  position: string,
  colors: any,
): ComponentNode {
  const spacingMarker = figma.createComponent();
  const value = createSpacingText(size, colors);
  const line = buildSpacingLine();
  line.resize(40, line.height);
  line.strokeStyleId = colors.dsPink500.id;
  line.name = `marker-hand`;

  spacingMarker.layoutPositioning = "AUTO";
  spacingMarker.itemSpacing = 2;
  spacingMarker.layoutAlign = "STRETCH";

  const bar = createSpacingBar(position);

  if (position === "top") {
    spacingMarker.name = "position=top";
    spacingMarker.appendChild(value);
    spacingMarker.appendChild(line);
    line.rotation = 90;
    spacingMarker.appendChild(bar);
  }
  if (position === "bottom") {
    spacingMarker.name = "position=bottom";
    spacingMarker.appendChild(bar);
    spacingMarker.appendChild(line);
    line.rotation = 90;
    spacingMarker.appendChild(value);
  }
  if (position === "left") {
    spacingMarker.name = "position=left";
    spacingMarker.appendChild(value);
    spacingMarker.appendChild(line);
    spacingMarker.appendChild(bar);
  }
  if (position === "right") {
    spacingMarker.name = "position=right";
    spacingMarker.appendChild(bar);
    spacingMarker.appendChild(line);
    spacingMarker.appendChild(value);
  }

  spacingMarker.counterAxisAlignItems = "CENTER";

  if (position === "top" || position === "bottom") {
    spacingMarker.layoutMode = "VERTICAL";
    spacingMarker.resize(16, 160);
  }
  if (position === "left" || position === "right") {
    spacingMarker.layoutMode = "HORIZONTAL";
    spacingMarker.resize(160, 16);
  }

  addNewTextProperty(spacingMarker, value, "text", "16");
  return spacingMarker;
}

export function buildSpacingMarkers(): ComponentSetNode {
  const colors = getColorStyles();
  const toolsPage = figma.root.findChild(
    (node) => node.name === INTERNAL_TOOLS_PAGE,
  ) as PageNode;

  if (!toolsPage) {
    throw new Error("Internal tools page not found");
  }

  const spacingTop = createSpacingMarker("16", "top", colors);
  const spacingBottom = createSpacingMarker("16", "bottom", colors);
  const spacingLeft = createSpacingMarker("16", "left", colors);
  const spacingRight = createSpacingMarker("16", "right", colors);

  const spacings = [spacingTop, spacingBottom, spacingLeft, spacingRight];
  spacings.forEach((node) => toolsPage.appendChild(node));

  const spacingComponentSet = figma.combineAsVariants(spacings, toolsPage);

  spacingComponentSet.name = DS_SPACING_MARKER;
  spacingComponentSet.x = 450;
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

  spacingLeft.resize(120, 16);
  spacingRight.resize(120, 16);

  return spacingComponentSet;
}
