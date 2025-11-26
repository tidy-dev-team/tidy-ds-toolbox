// Text Master module logic - handles text insertion and font loading

export async function handleTextMaster(
  action: string,
  payload: any,
  figma: any
): Promise<any> {
  switch (action) {
    case "insert-text":
      return await insertTextNode(payload.text, payload.style, figma);

    case "load-fonts":
      return await loadFonts(figma);

    default:
      throw new Error(`Unknown action: ${action}`);
  }
}

async function insertTextNode(
  text: string,
  style: any = {},
  figma: any
): Promise<any> {
  if (!text || text.trim().length === 0) {
    throw new Error("Text cannot be empty");
  }

  try {
    // Load default font
    await figma.loadFontAsync({ family: "Inter", style: "Regular" });

    // Create text node
    const textNode = figma.createText();
    textNode.characters = text;

    // Apply default styling
    textNode.fontSize = style.fontSize || 16;

    // Position based on current selection or viewport center
    const selection = figma.currentPage.selection;
    if (selection.length > 0) {
      const lastNode = selection[selection.length - 1];
      textNode.x = lastNode.x;
      textNode.y = lastNode.y + lastNode.height + 20;
    } else {
      const viewport = figma.viewport.center;
      textNode.x = viewport.x;
      textNode.y = viewport.y;
    }

    figma.currentPage.appendChild(textNode);
    figma.currentPage.selection = [textNode];
    figma.viewport.scrollAndZoomIntoView([textNode]);

    return {
      success: true,
      nodeId: textNode.id,
      message: "Text inserted successfully",
    };
  } catch (error: any) {
    // If Inter font fails, try with Roboto
    try {
      await figma.loadFontAsync({ family: "Roboto", style: "Regular" });
      const textNode = figma.createText();
      textNode.characters = text;
      textNode.fontSize = style.fontSize || 16;

      const viewport = figma.viewport.center;
      textNode.x = viewport.x;
      textNode.y = viewport.y;

      figma.currentPage.appendChild(textNode);
      figma.currentPage.selection = [textNode];
      figma.viewport.scrollAndZoomIntoView([textNode]);

      return {
        success: true,
        nodeId: textNode.id,
        message: "Text inserted successfully (using fallback font)",
      };
    } catch (fallbackError: any) {
      throw new Error(`Failed to load fonts: ${fallbackError.message}`);
    }
  }
}

async function loadFonts(figma: any): Promise<any> {
  const fontsToLoad = [
    { family: "Inter", style: "Regular" },
    { family: "Inter", style: "Bold" },
    { family: "Roboto", style: "Regular" },
  ];

  const loaded: string[] = [];
  const failed: string[] = [];

  for (const font of fontsToLoad) {
    try {
      await figma.loadFontAsync(font);
      loaded.push(`${font.family} ${font.style}`);
    } catch (error) {
      failed.push(`${font.family} ${font.style}`);
    }
  }

  return {
    success: true,
    loaded,
    failed,
    message: `Loaded ${loaded.length} fonts, failed ${failed.length}`,
  };
}
