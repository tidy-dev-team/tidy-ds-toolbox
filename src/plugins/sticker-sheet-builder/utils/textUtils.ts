export function createSectionSetTitle(currentType: string) {
  const title = figma.createText();
  title.fontSize = 30;
  title.fontName = { family: "Inter", style: "Medium" };
  title.characters = capitalizeFirstLetter(currentType);
  return title;
}
export function createSectionTitle(currentType: string) {
  const title = figma.createText();
  title.fontSize = 20;
  title.fontName = { family: "Inter", style: "Medium" };
  title.characters = capitalizeFirstLetter(currentType);
  return title;
}
export function createSubSectionTitle(currentType: string) {
  const title = figma.createText();
  title.fontSize = 14;
  title.fontName = { family: "Inter", style: "Medium" };
  title.characters = capitalizeFirstLetter(currentType);
  return title;
}

export function createElementLabelText(state: string) {
  const label = figma.createText();
  label.characters = state;
  // Brand blue for instance labels
  label.fills = [
    {
      type: "SOLID",
      color: { r: 0, g: 0.28235294, b: 0.69019608 },
    },
  ];
  return label;
}

export function capitalizeFirstLetter(str: string) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}
