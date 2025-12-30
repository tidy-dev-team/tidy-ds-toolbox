/// <reference types="@figma/plugin-typings" />

import { INTERNAL_TOOLS_PAGE } from "./constants";

/**
 * Find the Internal Tools page in the document
 */
export function findToolsPage(): PageNode | null {
  return figma.root.findChild(
    (node) => node.name === INTERNAL_TOOLS_PAGE,
  ) as PageNode | null;
}

/**
 * Get a tool component from the Internal Tools page
 * @param name - The name of the component to find (e.g., ".DS anatomy tags")
 * @returns The component or component set, or null if not found
 */
export function getToolComp(
  name: string,
): ComponentNode | ComponentSetNode | null {
  const toolsPage = findToolsPage();

  if (!toolsPage) {
    console.warn("Internal tools page not found");
    return null;
  }

  const toolComp = toolsPage.findOne((node) => node.name === name);

  if (
    toolComp &&
    (toolComp.type === "COMPONENT" || toolComp.type === "COMPONENT_SET")
  ) {
    return toolComp;
  }

  console.warn(`Tool component "${name}" not found on internal tools page`);
  return null;
}

/**
 * Check if internal tools page exists and has required components
 */
export function validateInternalTools(requiredComponents: string[]): {
  valid: boolean;
  missing: string[];
} {
  const toolsPage = findToolsPage();

  if (!toolsPage) {
    return { valid: false, missing: ["Internal tools page"] };
  }

  const missing: string[] = [];

  for (const componentName of requiredComponents) {
    const comp = toolsPage.findOne((node) => node.name === componentName);
    if (!comp) {
      missing.push(componentName);
    }
  }

  return { valid: missing.length === 0, missing };
}
