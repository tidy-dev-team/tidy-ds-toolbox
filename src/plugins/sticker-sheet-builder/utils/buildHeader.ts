import { buildAutoLayoutFrame } from "./utilityFunctions";
import arrowVN from "./arrow";
import { ComponentDescription } from "./parseDescription";
import { findDescriptionSection } from "./findDescriptionSection";

export default function buildHeader(
  name: string,
  description: ComponentDescription,
) {
  const headerFrame = buildHeaderFrame();

  buildTitleFrame(headerFrame, name);
  const infoFrame = buildInfoFrame(headerFrame, description);
  infoFrame.resize(520, infoFrame.height);
  infoFrame.layoutSizingVertical = "HUG";
  buildDividerFrame(headerFrame);
  buildBackToIndexFrame(headerFrame);

  return headerFrame;
}

function buildHeaderFrame() {
  const frame = buildAutoLayoutFrame("Header", "VERTICAL", 0, 60, 16);
  return frame;
}

function buildTitleFrame(parent: FrameNode, stickerName: string) {
  const frame = buildAutoLayoutFrame("Title", "HORIZONTAL", 0, 0, 4);
  const titleText = figma.createText();
  titleText.characters = stickerName;
  titleText.textCase = "UPPER";
  titleText.fontName = { family: "Inter", style: "Bold" };
  titleText.fontSize = 64;
  frame.appendChild(titleText);
  parent.appendChild(frame);
}

function buildInfoFrame(parent: FrameNode, description: ComponentDescription) {
  const frame = buildAutoLayoutFrame("Info", "HORIZONTAL", 0, 0, 8);
  frame.counterAxisAlignItems = "CENTER";
  buildInfoIcon();
  const elementDescription = findDescriptionSection(
    "ℹ️",
    description,
    "Add element description",
  );
  buildText(elementDescription);
  buildLink();

  parent.appendChild(frame);

  function buildInfoIcon() {
    const infoIcon = buildAutoLayoutFrame("Info Icon", "HORIZONTAL", 0, 0, 0);
    infoIcon.primaryAxisAlignItems = "CENTER";
    infoIcon.counterAxisAlignItems = "CENTER";
    infoIcon.resize(24, 24);
    infoIcon.cornerRadius = 999;
    infoIcon.fills = [
      {
        type: "SOLID",
        visible: true,
        opacity: 1,
        blendMode: "NORMAL",
        color: {
          r: 0.07058823853731155,
          g: 0.1411764770746231,
          b: 0.21960784494876862,
        },
        boundVariables: {},
      },
    ];
    const iconText = figma.createText();
    iconText.characters = "!";
    iconText.fontName = { family: "Inter", style: "Semi Bold" };
    iconText.fontSize = 14;
    iconText.fills = [
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
        boundVariables: {},
      },
    ];
    infoIcon.appendChild(iconText);

    frame.appendChild(infoIcon);
  }

  function buildLink() {
    const link = figma.createText();
    link.characters = "link";
    link.fontName = { family: "Inter", style: "Medium" };
    link.fontSize = 14;
    link.textDecoration = "UNDERLINE";
    link.fills = [
      {
        type: "SOLID",
        visible: true,
        opacity: 1,
        blendMode: "NORMAL",
        color: {
          r: 0,
          g: 0.6901960968971252,
          b: 1,
        },
        boundVariables: {},
      },
    ];
    frame.appendChild(link);
  }

  function buildText(desription: string) {
    const infoText = figma.createText();
    infoText.characters = desription;
    infoText.fontName = { family: "Inter", style: "Medium" };
    infoText.fontSize = 14;
    frame.appendChild(infoText);
    infoText.textAutoResize = "HEIGHT";
    infoText.layoutSizingHorizontal = "FILL";
  }
  return frame;
}

function buildDividerFrame(parent: FrameNode) {
  const frame = buildAutoLayoutFrame("Divider", "VERTICAL", 0, 0, 0);
  frame.paddingTop = 32;
  const divider = figma.createFrame();
  divider.resize(divider.width, 1);

  divider.fills = [
    {
      type: "SOLID",
      visible: true,
      opacity: 1,
      blendMode: "NORMAL",
      color: {
        r: 0.8199999928474426,
        g: 0.8199999928474426,
        b: 0.8199999928474426,
      },
      boundVariables: {},
    },
  ];

  frame.appendChild(divider);
  divider.layoutSizingHorizontal = "FILL";
  parent.appendChild(frame);
  frame.layoutSizingHorizontal = "FILL";
}
function buildBackToIndexFrame(parent: FrameNode) {
  const frame = buildAutoLayoutFrame(
    "Back to Index Frame",
    "HORIZONTAL",
    0,
    0,
    0,
  );
  parent.appendChild(frame);
  frame.layoutSizingHorizontal = "FILL";
  frame.primaryAxisAlignItems = "MAX";

  const button = buildAutoLayoutFrame(
    "back-to-index-button",
    "HORIZONTAL",
    8,
    4,
    4,
  );
  button.cornerRadius = 8;
  button.counterAxisAlignItems = "CENTER";
  button.strokes = [
    {
      type: "SOLID",
      visible: true,
      opacity: 1,
      blendMode: "NORMAL",
      color: {
        r: 0.8901960849761963,
        g: 0.8901960849761963,
        b: 0.8901960849761963,
      },
      boundVariables: {
        color: {
          type: "VARIABLE_ALIAS",
          id: "VariableID:25a2d8ef32443f647c490741dcb46cb90361b477/780:78",
        },
      },
    },
  ];
  button.strokeWeight = 1;

  const buttonContentColor: readonly Paint[] = [
    {
      type: "SOLID",
      visible: true,
      opacity: 1,
      blendMode: "NORMAL",
      color: {
        r: 0.07058823853731155,
        g: 0.1411764770746231,
        b: 0.21960784494876862,
      },
      boundVariables: {},
    },
  ];

  const arrow = figma.createVector();
  arrow.vectorNetwork = arrowVN;
  arrow.resize(10, 9);
  arrow.fills = buttonContentColor;
  arrow.strokes = [];
  const buttonText = figma.createText();
  buttonText.characters = "Back to index";
  buttonText.fontName = { family: "Inter", style: "Medium" };
  buttonText.fontSize = 14;
  buttonText.fills = buttonContentColor;

  button.appendChild(arrow);
  button.appendChild(buttonText);
  frame.appendChild(button);
  return frame;
}
