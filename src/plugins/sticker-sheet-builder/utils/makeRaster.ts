export async function getRaster(element: ComponentNode | ComponentSetNode) {
  const bytes = element.exportAsync({
    format: "PNG",
    constraint: { type: "SCALE", value: 2 },
  });
  const image = figma.createImage(await bytes);
  const frame = figma.createFrame();
  frame.x = 200;
  frame.resize(element.width, element.height);
  frame.fills = [
    {
      imageHash: image.hash,
      scaleMode: "FILL",
      scalingFactor: 1,
      type: "IMAGE",
    },
  ];
  return frame;
}
