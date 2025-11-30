/// <reference types="@figma/plugin-typings" />

/**
 * Extracts a component set to the top level of the page
 * @param element The component set to extract
 */
export function extractToTheTop(element: ComponentSetNode): void {
  if (!element.absoluteBoundingBox) return;

  const absX = element.absoluteBoundingBox.x;
  const absY = element.absoluteBoundingBox.y;
  const page = figma.currentPage;

  page.appendChild(element);
  element.x = absX;
  element.y = absY;
}
