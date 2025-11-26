// Shape Shifter module logic - handles rectangle creation

export async function handleShapeShifter(
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

    // Apply default fill
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

  // Select the created rectangles
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
    types: selection.map((node) => node.type),
    names: selection.map((node) => node.name),
  };
}
