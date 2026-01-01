/// <reference types="@figma/plugin-typings" />

import {
  INTERNAL_TOOLS_PAGE,
  DS_ANATOMY_TAGS,
  DS_SIZE_MARKER,
  DS_SPACING_MARKER,
} from "./constants";

interface CheckResult {
  exists: boolean;
  componentCount: number;
  missingComponents: string[];
  isHealthy: boolean;
}

function checkInternalTools(): CheckResult {
  const toolsPage = figma.root.findChild(
    (node) => node.name === INTERNAL_TOOLS_PAGE,
  ) as PageNode;

  if (!toolsPage) {
    return {
      exists: false,
      componentCount: 0,
      missingComponents: [DS_ANATOMY_TAGS, DS_SIZE_MARKER, DS_SPACING_MARKER],
      isHealthy: false,
    };
  }

  const requiredComponents = [
    DS_ANATOMY_TAGS,
    DS_SIZE_MARKER,
    DS_SPACING_MARKER,
  ];

  const missingComponents: string[] = [];

  for (const componentName of requiredComponents) {
    const component = toolsPage.findOne((node) => node.name === componentName);
    if (!component) {
      missingComponents.push(componentName);
    }
  }

  const componentCount = requiredComponents.length - missingComponents.length;
  const isHealthy = missingComponents.length === 0;

  return {
    exists: true,
    componentCount,
    missingComponents,
    isHealthy,
  };
}

export { checkInternalTools };
