import { buildAutoLayoutFrame } from "./utilityFunctions";

export function checkOrAddIndex(page: PageNode): FrameNode {
  let indexFrame = page.findChild(
    (node) => node.name.toLowerCase() === "index" && node.type === "FRAME",
  );
  if (!indexFrame) {
    indexFrame = buildAutoLayoutFrame("index", "VERTICAL", 60, 60, 24);
    indexFrame.cornerRadius = 40;
    addTitle(indexFrame);
    return indexFrame;
  }
  return indexFrame as FrameNode;
}

function addTitle(frame: FrameNode) {
  const titleFrame = buildAutoLayoutFrame("title-frame", "VERTICAL", 0, 60, 0);
  const title = figma.createText();
  title.characters = "INDEX";
  title.fontName = { family: "Inter", style: "Bold" };
  title.fontSize = 64;

  titleFrame.appendChild(title);
  frame.appendChild(titleFrame);
}
