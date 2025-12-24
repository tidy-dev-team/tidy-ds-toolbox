/**
 * Update report from canvas - sync deleted entries
 */

import { REPORT_PAGE, PLUGIN_DATA_NAMESPACE } from "../constants";

export function updateFromCanvas(): { success: boolean; message: string } {
  const reportFrame = findReportFrame();
  if (!(reportFrame && reportFrame.type === "FRAME")) {
    return { success: false, message: "Report frame not found" };
  }

  const keys = figma.root.getSharedPluginDataKeys(PLUGIN_DATA_NAMESPACE);
  const framesForUpdateNames: string[] = [];

  const framesForUpdate = reportFrame.findAll((node) =>
    node.name.startsWith("re-"),
  );

  if (!(framesForUpdate && framesForUpdate.length > 0)) {
    return { success: false, message: "No entries to update" };
  }

  framesForUpdate.forEach((frame) => {
    const keyPart = frame.name.replace("re-", "");
    framesForUpdateNames.push(keyPart);
  });

  let removedCount = 0;

  for (const foundKey of keys) {
    if (!framesForUpdateNames.includes(foundKey)) {
      const nodeId = foundKey.split("_")[0];
      const node = figma.getNodeById(nodeId);
      if (node) {
        const currentPage = getPage(node);
        if (currentPage) {
          removeNoteAndHighlight(currentPage, nodeId);
        }
      }
      figma.root.setSharedPluginData(PLUGIN_DATA_NAMESPACE, foundKey, "");
      removedCount++;
    }
  }

  return {
    success: true,
    message: `Updated from canvas. Removed ${removedCount} orphaned entries.`,
  };
}

function findReportFrame(): FrameNode | undefined {
  const reportPage = figma.root.children.find(
    (page) => page.name === REPORT_PAGE,
  );
  if (!reportPage) {
    return undefined;
  }
  const reportFrame = reportPage.children.find(
    (child) => child.name === "report-frame",
  );
  return reportFrame as FrameNode | undefined;
}

export function getPage(node: BaseNode): PageNode | null {
  if (node.type === "PAGE") {
    return node as PageNode;
  }
  if (node.parent) {
    return getPage(node.parent);
  }
  return null;
}

export function removeNoteAndHighlight(page: PageNode, key: string): void {
  const note = page.findOne((node) => node.name === key + "-note");
  if (note) note.remove();

  const highlight = page.findOne((node) => node.name === key + "-highlight");
  if (highlight) highlight.remove();
}
