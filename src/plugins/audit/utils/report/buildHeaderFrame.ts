/**
 * Build header frame for audit report
 */

import { buildAutoLayoutFrame } from "./buildAutoLayoutFrame";
import { COUNTER_COLORS } from "../constants";

/**
 * Convert hex color to RGB
 */
function hexToRgb(hex: string): RGB | null {
  const result = /^([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result
    ? {
        r: parseInt(result[1], 16) / 255,
        g: parseInt(result[2], 16) / 255,
        b: parseInt(result[3], 16) / 255,
      }
    : null;
}

export function buildHeaderFrame(keys: string[]): FrameNode {
  const headerFrame = buildAutoLayoutFrame(
    "report-header",
    "VERTICAL",
    100,
    100,
    50,
  );

  const { metadataFrame, introFrame, countersFrame } = buildFirstLevelFrames();

  const separatorOne = figma.createLine();
  const separatorTwo = figma.createLine();

  addMetaDataContent(metadataFrame);
  addIntroContent(introFrame);
  addCounterContent(countersFrame, keys);

  for (const element of [
    metadataFrame,
    separatorOne,
    introFrame,
    separatorTwo,
    countersFrame,
  ]) {
    headerFrame.appendChild(element);
    if ("layoutSizingHorizontal" in element) {
      element.layoutSizingHorizontal = "FILL";
    }
  }

  return headerFrame;
}

function addCounterContent(countersFrame: FrameNode, keys: string[]): void {
  const lowKeys = keys.filter((key) => key.includes("low")).length;
  const mediumKeys = keys.filter((key) => key.includes("medium")).length;
  const highKeys = keys.filter((key) => key.includes("high")).length;
  const criticalKeys = keys.filter((key) => key.includes("critical")).length;

  const lowCounter = buildOneCounter("Low", COUNTER_COLORS.low, lowKeys);
  const mediumCounter = buildOneCounter(
    "Medium",
    COUNTER_COLORS.medium,
    mediumKeys,
  );
  const highCounter = buildOneCounter("High", COUNTER_COLORS.high, highKeys);
  const criticalCounter = buildOneCounter(
    "Critical",
    COUNTER_COLORS.critical,
    criticalKeys,
  );

  [lowCounter, mediumCounter, highCounter, criticalCounter].forEach((node) =>
    countersFrame.appendChild(node),
  );
  countersFrame.primaryAxisAlignItems = "SPACE_BETWEEN";
}

function buildOneCounter(
  name: string,
  color: string,
  count: number,
): FrameNode {
  const counter = buildAutoLayoutFrame(
    `report-counter-${name.toLowerCase()}`,
    "VERTICAL",
    0,
    0,
    0,
  );
  counter.resize(268, 268);
  counter.cornerRadius = 999;

  if (color) {
    const rgbColor = hexToRgb(color);
    if (rgbColor) {
      counter.fills = [
        {
          type: "SOLID",
          color: rgbColor,
        },
      ];
    }
  }

  const counterTitle = figma.createText();
  counterTitle.characters = `${count}`;
  counterTitle.fontSize = 70;
  counterTitle.fontName = { family: "Inter", style: "Bold" };
  counter.primaryAxisAlignItems = "CENTER";
  counter.counterAxisAlignItems = "CENTER";
  counter.appendChild(counterTitle);

  return counter;
}

function addIntroContent(introFrame: FrameNode): void {
  const leftIntroWrapper = buildAutoLayoutFrame(
    "report-left-intro-wrapper",
    "VERTICAL",
    0,
    0,
    24,
  );

  const introTitle = figma.createText();
  introTitle.characters = "Short Intro";
  introTitle.fontSize = 50;
  introTitle.fontName = { family: "Inter", style: "Bold" };

  const introText = figma.createText();
  introText.characters = "This is a short intro to the report.";
  introText.fontSize = 35;
  introText.fontName = { family: "Inter", style: "Regular" };

  [introTitle, introText].forEach((node) => leftIntroWrapper.appendChild(node));

  const rightIntroWrapper = buildAutoLayoutFrame(
    "report-right-intro-wrapper",
    "VERTICAL",
    0,
    0,
    16,
  );

  const legendTitle = figma.createText();
  legendTitle.characters = "Severity levels";
  legendTitle.fontSize = 35;
  legendTitle.fontName = { family: "Inter", style: "Bold" };

  const legendRow1 = buildOneLegendRow("Low", COUNTER_COLORS.low);
  const legendRow2 = buildOneLegendRow("Medium", COUNTER_COLORS.medium);
  const legendRow3 = buildOneLegendRow("High", COUNTER_COLORS.high);
  const legendRow4 = buildOneLegendRow("Critical", COUNTER_COLORS.critical);

  [legendTitle, legendRow1, legendRow2, legendRow3, legendRow4].forEach(
    (node) => rightIntroWrapper.appendChild(node),
  );

  introFrame.appendChild(leftIntroWrapper);
  introFrame.appendChild(rightIntroWrapper);
  introFrame.primaryAxisAlignItems = "SPACE_BETWEEN";
}

function buildOneLegendRow(level: string, color: string): FrameNode {
  const legendRow = buildAutoLayoutFrame(
    "report-legend-row",
    "HORIZONTAL",
    0,
    0,
    32,
  );

  const legendLevel = figma.createText();
  legendLevel.characters = level.toUpperCase();
  legendLevel.fontSize = 28;
  legendLevel.fontName = { family: "Inter", style: "Bold" };
  legendLevel.resize(192, legendLevel.height);

  const legendColor = figma.createRectangle();
  legendColor.resize(46, 46);

  if (color) {
    const rgbColor = hexToRgb(color);
    if (rgbColor) {
      legendColor.fills = [
        {
          type: "SOLID",
          color: rgbColor,
        },
      ];
    }
  }
  legendColor.cornerRadius = 999;

  const legendExplanation = figma.createText();
  legendExplanation.characters = "Short explanation";
  legendExplanation.fontSize = 24;
  legendExplanation.fontName = { family: "Inter", style: "Regular" };
  legendExplanation.resize(220, legendExplanation.height);

  legendRow.appendChild(legendColor);
  legendRow.appendChild(legendLevel);
  legendRow.appendChild(legendExplanation);

  return legendRow;
}

function addMetaDataContent(metadataFrame: FrameNode): void {
  const leftMetaWrapper = buildAutoLayoutFrame(
    "report-left-meta-wrapper",
    "VERTICAL",
    0,
    0,
    0,
  );

  const auditTitle = figma.createText();
  auditTitle.characters = "Audit Title";
  auditTitle.fontSize = 56;
  auditTitle.fontName = { family: "Inter", style: "Regular" };

  const auditDate = auditTitle.clone();
  auditDate.characters = "Audit Date";

  const companyName = auditTitle.clone();
  companyName.characters = "Company Name";

  const whatElse = auditTitle.clone();
  whatElse.characters = "What Else?";

  [auditTitle, auditDate, companyName, whatElse].forEach((node) =>
    leftMetaWrapper.appendChild(node),
  );

  const logoFrame = buildAutoLayoutFrame(
    "report-logo-frame",
    "HORIZONTAL",
    0,
    0,
    0,
  );
  logoFrame.cornerRadius = 999;
  logoFrame.resize(270, 270);
  logoFrame.fills = [
    {
      type: "SOLID",
      visible: true,
      opacity: 1,
      blendMode: "NORMAL",
      color: {
        r: 0.8509804010391235,
        g: 0.8509804010391235,
        b: 0.8509804010391235,
      },
    },
  ];

  const logoText = figma.createText();
  logoText.characters = "LOGO";
  logoText.fontSize = 70;
  logoText.fontName = { family: "Inter", style: "Regular" };
  logoFrame.appendChild(logoText);
  logoFrame.primaryAxisAlignItems = "CENTER";
  logoFrame.counterAxisAlignItems = "CENTER";

  metadataFrame.appendChild(leftMetaWrapper);
  metadataFrame.appendChild(logoFrame);
  metadataFrame.primaryAxisAlignItems = "SPACE_BETWEEN";
}

function buildFirstLevelFrames(): {
  metadataFrame: FrameNode;
  introFrame: FrameNode;
  countersFrame: FrameNode;
} {
  const metadataFrame = buildAutoLayoutFrame(
    "report-metadata",
    "HORIZONTAL",
    0,
    0,
    0,
  );
  const introFrame = buildAutoLayoutFrame(
    "report-intro",
    "HORIZONTAL",
    0,
    0,
    0,
  );
  const countersFrame = buildAutoLayoutFrame(
    "report-counters",
    "HORIZONTAL",
    0,
    0,
    0,
  );

  return {
    metadataFrame,
    introFrame,
    countersFrame,
  };
}
