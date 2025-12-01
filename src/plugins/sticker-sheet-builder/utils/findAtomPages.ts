export function findAtomPages() {
  const pages = figma.root.children;
  const atomsTitleIndex = pages.findIndex((page) =>
    page.name.startsWith("⚛️ Atoms"),
  );
  const moleculesTitleIndex = pages.findIndex((page) =>
    page.name.startsWith("🧬 Molecules"),
  );
  const atomPages = pages.slice(atomsTitleIndex + 1, moleculesTitleIndex);
  return atomPages;
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

export function getComponentsFromPage(atomPages: PageNode[]) {
  const components: any = [];
  for (const page of atomPages) {
    const componentsAndSets = page.findAllWithCriteria({
      types: ["COMPONENT", "COMPONENT_SET"],
    });
    componentsAndSets.forEach((item) => {
      if (
        !item.name.startsWith(".") &&
        item.description.toLowerCase().includes("ℹ️")
      ) {
        components.push(item);
      }
    });
  }
  return components;
}
