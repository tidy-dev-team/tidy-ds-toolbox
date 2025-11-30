export function lockStickers(frame: FrameNode) {
  if (frame.type !== "FRAME") return;
  frame.layoutMode = "NONE";
  const allFrames = frame.findAllWithCriteria({
    types: ["FRAME"],
  });
  allFrames.forEach((node) => {
    if (node.type === "FRAME") {
      node.layoutMode = "NONE";
    }
  });
  groupFrameContents(frame);
  frame.locked = true;
}
function groupFrameContents(frame: FrameNode) {
  const elementsToGroup = frame.findAll((node) => {
    return node.type === "INSTANCE" && !node.name.startsWith(".");
  });
  elementsToGroup.forEach((node) => {
    try {
      const absX = node.absoluteTransform[0][2];
      const absY = node.absoluteTransform[1][2];
      figma.currentPage.appendChild(node);
      node.x = absX;
      node.y = absY;
    } catch (error) {}
  });
}
