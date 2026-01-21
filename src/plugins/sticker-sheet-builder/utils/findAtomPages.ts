import { PageMarker } from "../types";

export function findAtomPages(
  startMarker: PageMarker | null,
  endMarker: PageMarker | null,
): PageNode[] {
  const pages = figma.root.children;

  // If no markers configured, return empty array
  if (!startMarker || !endMarker) {
    return [];
  }

  const startIndex = pages.findIndex((page) => page.id === startMarker.id);
  const endIndex = pages.findIndex((page) => page.id === endMarker.id);

  // If markers not found, return empty array
  if (startIndex === -1 || endIndex === -1) {
    return [];
  }

  // Get pages between markers (exclusive of marker pages)
  return pages.slice(startIndex + 1, endIndex);
}

export function findStickerSheetPage() {
  const pages = figma.root.children;
  return pages.find((page) => page.name === "Stickersheet");
}

export function getStickerSheetPage() {
  const found = findStickerSheetPage();
  if (!found) {
    let stickerSheetPage = figma.createPage();
    figma.root.insertChild(0, stickerSheetPage);
    stickerSheetPage.name = "Stickersheet";
    return stickerSheetPage;
  }
  return found;
}

export interface ComponentWithPage {
  component: ComponentNode | ComponentSetNode;
  pageName: string;
}

export function getComponentsFromPage(
  atomPages: PageNode[],
  requireDescription: boolean = true,
): ComponentWithPage[] {
  const components: ComponentWithPage[] = [];
  for (const page of atomPages) {
    const componentsAndSets = page.findAllWithCriteria({
      types: ["COMPONENT", "COMPONENT_SET"],
    });
    componentsAndSets.forEach((item) => {
      // Skip components that are variants inside a ComponentSet
      // We only want the ComponentSet itself, not its children
      if (item.type === "COMPONENT" && item.parent?.type === "COMPONENT_SET") {
        return;
      }

      const isPublic = !item.name.startsWith(".");
      const hasDescription =
        !requireDescription || item.description.toLowerCase().includes("ℹ️");

      if (isPublic && hasDescription) {
        components.push({ component: item, pageName: page.name });
      }
    });
  }
  return components;
}

export function getAllPages(): PageMarker[] {
  return figma.root.children.map((page) => ({
    id: page.id,
    name: page.name,
  }));
}
