import buildSizes from "./buildSizes";
import buildBinariesGrids from "./buildBinariesGrid";
import buildOtherVariants from "./buildOtherVariants";
import buildHeader from "./buildHeader";
import { getBaseProps } from "./getBaseProps";
import { buildAutoLayoutFrame } from "./utilityFunctions";
import { getProps } from "./getAllVariantProps";
import { getComponentProps } from "./getComponentProps";
import { getMainComponent } from "./getMainComponent";
import buildBasicGrid from "./buildBasicGrid";
import { buildBooleans } from "./buildBooleans";
import { checkOrAddIndex } from "./checkOrAddIndex";
import { getRaster } from "./makeRaster";
import { getStickerSheetPage } from "./findAtomPages";
import { appendToStickerSheetPage } from "./appendToStickerSheetPage";
import { parseComponentDescription } from "./parseDescription";

export interface BuildStickerOptions {
  includeInfo?: boolean;
}

export default async function buildOneSticker(
  node: InstanceNode | ComponentNode | ComponentSetNode,
  options: BuildStickerOptions = {},
) {
  const { includeInfo = true } = options;
  const stickerSheetPage = getStickerSheetPage();

  const mainComponent = await getMainComponent(node);
  // emit("NOW_BUILDING", mainComponent?.name);

  if (!mainComponent) {
    figma.notify("MAIN COMPONENT IS NOT FOUND", { error: true });
    return null;
  }

  const description = parseComponentDescription(mainComponent.description);

  const componentProps = getComponentProps(mainComponent);
  const { stateProps, typeProps, sizeProps, binaryProps, allOtherProps } =
    getProps(componentProps);
  const booleanProps = componentProps.boolean;
  const baseProps = getBaseProps(typeProps, stateProps, allOtherProps);

  let defaultVariant: ComponentNode;
  if (mainComponent.type === "COMPONENT") {
    defaultVariant = mainComponent;
  } else {
    defaultVariant = mainComponent.defaultVariant;
  }

  const raster = await getRaster(defaultVariant);

  const stickerFrame = buildStickerFrame(mainComponent.name);

  const headerFrame = buildHeader(mainComponent.name, description, includeInfo);

  stickerFrame.appendChild(headerFrame);
  headerFrame.layoutSizingHorizontal = "FILL";

  const sizeFrame = sizeProps.length
    ? buildSizes(defaultVariant, sizeProps)
    : null;

  const binaryFrames = binaryProps.length
    ? buildBinariesGrids(defaultVariant, binaryProps)
    : null;

  const booleansFrame = buildBooleans(
    mainComponent,
    defaultVariant,
    booleanProps,
  );

  const basicGrid = baseProps
    ? buildBasicGrid(
        defaultVariant,
        baseProps?.firstProp,
        baseProps?.secondProp,
      )
    : null;

  let otherVariantsFrame: FrameNode | undefined;

  if (baseProps && baseProps.otherProps?.length && basicGrid) {
    otherVariantsFrame = buildOtherVariants(basicGrid, baseProps.otherProps);
  }

  if (sizeFrame) stickerFrame.appendChild(sizeFrame);

  if (binaryFrames) {
    for (const frame of binaryFrames) {
      stickerFrame.appendChild(frame);
    }
  }

  if (booleansFrame) stickerFrame.appendChild(booleansFrame);

  if (otherVariantsFrame) {
    stickerFrame.appendChild(otherVariantsFrame);
  } else {
    if (basicGrid) stickerFrame.appendChild(basicGrid);
  }

  appendToStickerSheetPage(
    stickerSheetPage,
    stickerFrame,
    mainComponent,
    raster,
    description,
  );
}

export function addToIndex(
  stickerSheetPage: PageNode,
  elementName: string,
  stickerFrame: FrameNode,
  raster: FrameNode,
) {
  const indexFrame = checkOrAddIndex(stickerSheetPage);
  const indexEntry = figma.createText();
  const indexEntryFrame = buildAutoLayoutFrame(
    ".⛔️ Stickersheet-index",
    "VERTICAL",
    24,
    24,
    12,
  );
  indexEntryFrame.fills = [
    {
      type: "SOLID",
      visible: true,
      opacity: 1,
      blendMode: "NORMAL",
      color: {
        r: 0.9490196108818054,
        g: 0.9490196108818054,
        b: 0.9607843160629272,
      },
      boundVariables: {},
    },
  ];
  const wrappedRaster = wrapImage(raster);
  indexEntryFrame.appendChild(wrappedRaster);
  wrappedRaster.layoutSizingHorizontal = "FILL";
  indexEntryFrame.appendChild(indexEntry);
  indexEntry.characters = "↪ " + elementName;
  indexEntry.fontName = {
    family: "Inter",
    style: "Medium",
  };
  indexEntry.fontSize = 20;
  indexEntry.hyperlink = { type: "NODE", value: stickerFrame.id };
  const backToIndex = stickerFrame.findOne(
    (node) => node.name === "Back to index",
  );
  if (backToIndex && backToIndex.type === "TEXT") {
    backToIndex.hyperlink = { type: "NODE", value: indexFrame.id };
  }
  indexFrame.appendChild(indexEntryFrame);
  indexEntryFrame.layoutSizingHorizontal = "FILL";
  return indexFrame;
}

function wrapImage(image: FrameNode) {
  const frame = buildAutoLayoutFrame("wrapper", "VERTICAL", 60, 60, 60);
  frame.paddingTop = 24;
  frame.paddingBottom = 24;
  frame.paddingLeft = 24;
  frame.paddingRight = 24;
  frame.cornerRadius = 8;
  frame.fills = [
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
  frame.appendChild(image);
  frame.primaryAxisAlignItems = "CENTER";
  frame.counterAxisAlignItems = "CENTER";
  return frame;
}

function buildStickerFrame(name: string) {
  const frame = buildAutoLayoutFrame(name, "VERTICAL", 60, 60, 60);
  frame.paddingTop = 24;
  frame.cornerRadius = 40;
  return frame;
}
