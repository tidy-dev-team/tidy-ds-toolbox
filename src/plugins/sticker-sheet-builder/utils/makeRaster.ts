// Maximum image size Figma can handle (approximately 4096x4096 or ~16MP)
const MAX_IMAGE_BYTES = 16 * 1024 * 1024; // 16MB as a safe limit

export async function getRaster(element: ComponentNode | ComponentSetNode) {
  const frame = figma.createFrame();
  frame.x = 200;
  frame.resize(element.width, element.height);

  try {
    // Try with scale 2 first
    let bytes = await element.exportAsync({
      format: "PNG",
      constraint: { type: "SCALE", value: 2 },
    });

    // If image is too large, try with scale 1
    if (bytes.byteLength > MAX_IMAGE_BYTES) {
      console.warn(
        `[Sticker Sheet] Image too large at scale 2 (${(bytes.byteLength / 1024 / 1024).toFixed(2)}MB), trying scale 1`,
      );
      bytes = await element.exportAsync({
        format: "PNG",
        constraint: { type: "SCALE", value: 1 },
      });
    }

    // If still too large, try with scale 0.5
    if (bytes.byteLength > MAX_IMAGE_BYTES) {
      console.warn(
        `[Sticker Sheet] Image still too large at scale 1 (${(bytes.byteLength / 1024 / 1024).toFixed(2)}MB), trying scale 0.5`,
      );
      bytes = await element.exportAsync({
        format: "PNG",
        constraint: { type: "SCALE", value: 0.5 },
      });
    }

    const image = figma.createImage(bytes);
    frame.fills = [
      {
        imageHash: image.hash,
        scaleMode: "FILL",
        scalingFactor: 1,
        type: "IMAGE",
      },
    ];
  } catch (error) {
    // If image creation fails (e.g., image too large), create a placeholder
    // Use a simple striped pattern to indicate the image couldn't be loaded
    console.warn(
      `[Sticker Sheet] Failed to create image for "${element.name}": ${error}. Using placeholder.`,
    );
    frame.name = `⚠️ ${element.name} (image too large)`;
    frame.fills = [
      {
        type: "SOLID",
        color: { r: 0.95, g: 0.95, b: 0.95 },
      },
    ];
    frame.strokes = [
      {
        type: "SOLID",
        color: { r: 0.8, g: 0.4, b: 0.4 },
      },
    ];
    frame.strokeWeight = 2;
    frame.dashPattern = [8, 4];
  }

  return frame;
}
