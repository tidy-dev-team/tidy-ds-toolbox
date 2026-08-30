/// <reference types="@figma/plugin-typings" />

/**
 * Load fonts from an array of text nodes
 * This ensures fonts are loaded before modifying text content
 */
export async function loadFontsFromNodes(nodes: TextNode[]): Promise<void> {
  const fontPromises: Promise<void>[] = [];
  const loadedFonts = new Set<string>();

  for (const node of nodes) {
    if (node.type !== "TEXT") continue;

    const fontName = node.fontName;

    // Skip mixed fonts - would need more complex handling
    if (fontName === figma.mixed) continue;

    const fontKey = `${fontName.family}-${fontName.style}`;
    if (!loadedFonts.has(fontKey)) {
      loadedFonts.add(fontKey);
      fontPromises.push(figma.loadFontAsync(fontName));
    }
  }

  await Promise.all(fontPromises);
}

/**
 * Load the Inter font family (commonly used for labels)
 */
export async function loadInterFont(): Promise<void> {
  await Promise.all([
    figma.loadFontAsync({ family: "Inter", style: "Regular" }),
    figma.loadFontAsync({ family: "Inter", style: "Medium" }),
    figma.loadFontAsync({ family: "Inter", style: "Bold" }),
  ]);
}

/**
 * Find all text nodes within a node tree
 */
export function findAllTextNodes(node: BaseNode): TextNode[] {
  const textNodes: TextNode[] = [];

  if (node.type === "TEXT") {
    textNodes.push(node);
  } else if ("children" in node) {
    for (const child of node.children) {
      textNodes.push(...findAllTextNodes(child));
    }
  }

  return textNodes;
}
