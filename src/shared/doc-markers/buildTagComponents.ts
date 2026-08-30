/// <reference types="@figma/plugin-typings" />

import {
  addNewTextProperty,
  addNewBooleanProperty,
} from "./componentPropertyHelpers";
import { getColorStyles } from "./colorStyles";
import { INTERNAL_TOOLS_PAGE, DS_ANATOMY_TAGS } from "./constants";

function createTagText(char: string): TextNode {
  const letter = figma.createText();
  letter.fills = [
    {
      type: "SOLID",
      visible: true,
      opacity: 1,
      blendMode: "NORMAL",
      color: {
        r: 1,
        g: 1,
        b: 1,
      },
    },
  ];
  letter.fontSize = 14;
  letter.fontName = {
    family: "Inter",
    style: "Semi Bold",
  };
  letter.textCase = "UPPER";
  letter.characters = char;
  letter.textAlignHorizontal = "CENTER";
  letter.textAlignVertical = "CENTER";
  letter.lineHeight = {
    unit: "PERCENT",
    value: 100,
  };
  return letter;
}

function createTagEllipse(textNode: TextNode, colors: any): FrameNode {
  const ellipse = figma.createFrame();
  ellipse.bottomLeftRadius = 50;
  ellipse.bottomRightRadius = 50;
  ellipse.topRightRadius = 50;
  ellipse.topLeftRadius = 50;
  ellipse.fillStyleId = colors.dsGray900.id;
  ellipse.appendChild(textNode);
  ellipse.layoutPositioning = "AUTO";
  ellipse.layoutMode = "VERTICAL";
  ellipse.resize(24, 24);
  ellipse.primaryAxisAlignItems = "CENTER";
  ellipse.counterAxisAlignItems = "CENTER";
  ellipse.name = "index";
  return ellipse;
}

function createTagLineBox(colors: any): FrameNode {
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
  line.strokeWeight = 1;
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

  line.resize(40, line.height);

  const lineBox = figma.createFrame();
  lineBox.appendChild(line);
  lineBox.layoutPositioning = "AUTO";
  lineBox.layoutMode = "VERTICAL";
  lineBox.counterAxisAlignItems = "CENTER";
  lineBox.counterAxisSizingMode = "FIXED";
  lineBox.resize(24, 82);
  lineBox.layoutGrow = 1;
  lineBox.fills = [];
  line.rotation = 90;
  line.layoutGrow = 1;
  line.strokeStyleId = colors.dsGray900.id;
  return lineBox;
}

function buildTagLabelText(label: string): TextNode {
  const labelText = figma.createText();
  labelText.fillStyleId = "ds-gray-900";
  labelText.fontSize = 14;
  labelText.fontName = {
    family: "Inter",
    style: "Medium",
  };
  labelText.characters = label;
  return labelText;
}

export function buildTag(
  letter: string,
  type: string,
  label: string,
  isLink = true,
  colors: any,
): ComponentNode {
  const index = createTagText(letter);
  const ellipse = createTagEllipse(index, colors);
  const tag = figma.createComponent();
  tag.layoutPositioning = "AUTO";

  if (type === "bottom") {
    const lineBox = createTagLineBox(colors);
    tag.counterAxisSizingMode = "AUTO";
    tag.layoutMode = "VERTICAL";
    tag.appendChild(ellipse);
    tag.appendChild(lineBox);
    tag.resize(24, 32);
    addNewTextProperty(tag, index, "index", "A");
    return tag;
  }

  if (type === "top") {
    const lineBox = createTagLineBox(colors);
    tag.counterAxisSizingMode = "AUTO";
    tag.layoutMode = "VERTICAL";
    tag.appendChild(lineBox);
    tag.appendChild(ellipse);
    tag.resize(24, 32);
    addNewTextProperty(tag, index, "index", "A");
    return tag;
  }

  if (type === "left") {
    const lineBox = createTagLineBox(colors);
    tag.counterAxisSizingMode = "AUTO";
    tag.layoutMode = "HORIZONTAL";
    tag.appendChild(lineBox);
    tag.appendChild(ellipse);
    lineBox.rotation = 90;
    lineBox.layoutAlign = "STRETCH";
    tag.resize(32, 24);
    addNewTextProperty(tag, index, "index", "A");
    return tag;
  }

  if (type === "right") {
    const lineBox = createTagLineBox(colors);
    tag.counterAxisSizingMode = "AUTO";
    tag.layoutMode = "HORIZONTAL";
    tag.appendChild(ellipse);
    tag.appendChild(lineBox);
    lineBox.rotation = 90;
    lineBox.layoutAlign = "STRETCH";
    tag.resize(32, 24);
    addNewTextProperty(tag, index, "index", "A");
    return tag;
  }

  if (type === "index") {
    tag.counterAxisSizingMode = "AUTO";
    tag.layoutMode = "HORIZONTAL";
    tag.appendChild(ellipse);
    tag.resize(24, 24);
    addNewTextProperty(tag, index, "index", "A");
    return tag;
  }

  if (
    type === "text" ||
    type === "important" ||
    type === "info" ||
    type === "size" ||
    type === "cornerRadius"
  ) {
    const text = buildTagLabelText(label);
    tag.resize(24, 24);
    tag.counterAxisSizingMode = "AUTO";
    tag.counterAxisAlignItems = "CENTER";
    tag.itemSpacing = 8;
    tag.layoutMode = "HORIZONTAL";
    tag.appendChild(ellipse);
    tag.appendChild(text);

    if (isLink) {
      const linkText = buildTagLabelText("link");
      linkText.fillStyleId = colors.dsLightBlue500.id;
      linkText.textDecoration = "UNDERLINE";
      tag.appendChild(linkText);
      addNewTextProperty(tag, linkText, "link", "link");
      addNewBooleanProperty(tag, linkText, "Show link", true);
    }

    text.textCase = "ORIGINAL";
    if (type !== "text") {
      ellipse.fillStyleId = colors.dsGray600.id;
    }
    if (type === "info") {
      ellipse.paddingLeft = 1;
      ellipse.paddingBottom = 1;
    }

    if (type === "text") {
      if (colors.dsGray900) {
        ellipse.fillStyleId = colors.dsGray900.id;
      }
      addNewTextProperty(tag, index, "index", "A");
    }

    addNewTextProperty(tag, text, "label", label);
    return tag;
  }

  return tag;
}

export function buildTagComponents(): ComponentSetNode {
  const colors = getColorStyles();
  const toolsPage = figma.root.findChild(
    (node) => node.name === INTERNAL_TOOLS_PAGE,
  ) as PageNode;

  if (!toolsPage) {
    throw new Error("Internal tools page not found");
  }

  const tagBottomLine = buildTag("A", "bottom", "", true, colors);
  tagBottomLine.name = "type=bottom line";
  const tagTopLine = buildTag("B", "top", "", true, colors);
  tagTopLine.name = "type=top line";
  const tagLeftLine = buildTag("C", "left", "", true, colors);
  tagLeftLine.name = "type=left line";
  const tagRightLine = buildTag("D", "right", "", true, colors);
  tagRightLine.name = "type=right line";
  const tagIndex = buildTag("E", "index", "", true, colors);
  tagIndex.name = "type=index only";
  const tagText = buildTag("F", "text", "Text", true, colors);
  tagText.name = "type=text";
  const tagImportant = buildTag("!", "important", "Text", true, colors);
  tagImportant.name = "type=important";
  const tagInfo = buildTag("»", "info", "Text", true, colors);
  tagInfo.name = "type=info";
  const tagSize = buildTag("", "size", "Text", false, colors);
  tagSize.name = "type=size";
  const tagCornerRadius = buildTag("", "cornerRadius", "Text", false, colors);
  tagCornerRadius.name = "type=cornerRadius";

  const tags = [
    tagTopLine,
    tagRightLine,
    tagBottomLine,
    tagLeftLine,
    tagIndex,
    tagText,
    tagImportant,
    tagInfo,
    tagSize,
    tagCornerRadius,
  ];

  tags.forEach((node) => toolsPage.appendChild(node));

  const tagComponentSet = figma.combineAsVariants(tags, toolsPage);
  tagComponentSet.name = DS_ANATOMY_TAGS;
  tagComponentSet.x = 450;
  tagComponentSet.y = 1500;
  tagComponentSet.layoutPositioning = "AUTO";
  tagComponentSet.layoutMode = "VERTICAL";
  tagComponentSet.itemSpacing = 20;
  tagComponentSet.fills = [
    {
      type: "SOLID",
      visible: true,
      opacity: 1,
      blendMode: "NORMAL",
      color: {
        r: 1,
        g: 1,
        b: 1,
      },
    },
  ];
  tagComponentSet.paddingBottom = 20;
  tagComponentSet.paddingTop = 20;
  tagComponentSet.paddingLeft = 20;
  tagComponentSet.paddingRight = 20;
  tagComponentSet.cornerRadius = 28;
  tagComponentSet.resize(372, tagComponentSet.height);

  return tagComponentSet;
}
