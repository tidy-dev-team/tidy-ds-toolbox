/// <reference types="@figma/plugin-typings" />

import { INTERNAL_TOOLS_PAGE } from "./constants";

interface DeleteResult {
  success: boolean;
  message: string;
}

async function deleteInternalTools(): Promise<DeleteResult> {
  try {
    const toolsPage = figma.root.findChild(
      (node) => node.name === INTERNAL_TOOLS_PAGE,
    ) as PageNode;

    if (!toolsPage) {
      return {
        success: true,
        message: "Internal tools page not found",
      };
    }

    toolsPage.remove();

    return {
      success: true,
      message: "Internal tools page deleted successfully",
    };
  } catch (error) {
    return {
      success: false,
      message: `Failed to delete internal tools: ${error}`,
    };
  }
}

export { deleteInternalTools };
