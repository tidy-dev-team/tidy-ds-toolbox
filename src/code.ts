// Main thread code for Figma plugin
figma.showUI(__html__, { width: 800, height: 600 });

// Shape Shifter Logic
async function handleShapeShifter(
  action: string,
  payload: any,
  figma: any
): Promise<any> {
  switch (action) {
    case "create-rects":
      return await createRectangles(payload.count, figma);
    case "get-selection":
      return getSelection(figma);
    default:
      throw new Error(`Unknown action: ${action}`);
  }
}

async function createRectangles(count: number, figma: any): Promise<any> {
  if (count < 1 || count > 100) {
    throw new Error("Count must be between 1 and 100");
  }

  const rectangles: any[] = [];
  const spacing = 20;
  const size = 100;

  for (let i = 0; i < count; i++) {
    const rect = figma.createRectangle();
    rect.resize(size, size);
    rect.x = i * (size + spacing);
    rect.y = 0;

    rect.fills = [
      {
        type: "SOLID",
        color: {
          r: Math.random(),
          g: Math.random(),
          b: Math.random(),
        },
      },
    ];

    figma.currentPage.appendChild(rect);
    rectangles.push(rect);
  }

  figma.currentPage.selection = rectangles;
  figma.viewport.scrollAndZoomIntoView(rectangles);

  return {
    success: true,
    count: rectangles.length,
    message: `Created ${rectangles.length} rectangle${rectangles.length > 1 ? "s" : ""}`,
  };
}

function getSelection(figma: any): any {
  const selection = figma.currentPage.selection;

  return {
    count: selection.length,
    types: selection.map((node: any) => node.type),
    names: selection.map((node: any) => node.name),
  };
}

// Text Master Logic
async function handleTextMaster(
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
    await figma.loadFontAsync({ family: "Inter", style: "Regular" });

    const textNode = figma.createText();
    textNode.characters = text;
    textNode.fontSize = style.fontSize || 16;

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

// Module handlers map
const handlers: Record<string, Function> = {
  "shape-shifter": handleShapeShifter,
  "text-master": handleTextMaster,
  "color-lab": async () => ({}),
};

// Message routing
figma.ui.onmessage = async (msg: any) => {
  if (msg?.pluginMessage) {
    const { target, action, payload, requestId } = msg.pluginMessage;

    console.log(`[Main] Received: ${target}:${action}`, payload);

    try {
      // Handle shell-specific actions
      if (target === "shell") {
        if (action === "save-storage") {
          await figma.clientStorage.setAsync(payload.key, payload.value);
          return;
        } else if (action === "load-storage") {
          const value = await figma.clientStorage.getAsync(payload.key);
          figma.ui.postMessage({
            type: "response",
            requestId,
            result: value,
          });
          return;
        }
      }

      if (handlers[target]) {
        const result = await handlers[target](action, payload, figma);

        // Send response back to UI if requestId provided
        if (requestId) {
          figma.ui.postMessage({
            type: "response",
            requestId,
            result,
          });
        }
      } else {
        console.error(`[Main] Unknown target: ${target}`);
        figma.ui.postMessage({
          type: "error",
          requestId,
          error: `Unknown module: ${target}`,
        });
      }
    } catch (error: any) {
      console.error(`[Main] Error handling ${target}:${action}`, error);
      figma.ui.postMessage({
        type: "error",
        requestId,
        error: error?.message || String(error),
      });
    }
  }
};
