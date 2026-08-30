/// <reference types="@figma/plugin-typings" />

function hexToRGB(hex: string) {
  const r = parseInt(hex.slice(0, 2), 16) / 255;
  const g = parseInt(hex.slice(2, 4), 16) / 255;
  const b = parseInt(hex.slice(4, 6), 16) / 255;

  return {
    r,
    g,
    b,
  };
}

function createPaintStyle(name: string, hex: string): PaintStyle {
  const baseStyle = figma.createPaintStyle();
  baseStyle.name = name;
  const paint: SolidPaint = {
    type: "SOLID",
    color: hexToRGB(hex),
  };
  baseStyle.paints = [paint];
  return baseStyle;
}

function getLocalColorStyle(name: string): PaintStyle | null {
  const styles = figma.getLocalPaintStyles();
  return styles.find((style) => style.name === name) || null;
}

export function setColorStyle(name: string, hex: string): PaintStyle {
  const existingStyle = getLocalColorStyle(name);
  if (existingStyle) {
    return existingStyle;
  }
  const newStyle = createPaintStyle(name, hex);
  return newStyle;
}

export function getColorStyles() {
  return {
    dsWhite: setColorStyle("ds-admin/White", "FFFFFF"),
    dsGray600: setColorStyle("ds-admin/gray/gray-600", "707070"),
    dsGray900: setColorStyle("ds-admin/gray/gray-900", "292929"),
    dsPink500: setColorStyle("ds-admin/pink/pink-500", "EC2D79"),
    dsLightBlue500: setColorStyle(
      "ds-admin/light-blue/light-blue-500",
      "0075E1",
    ),
  };
}
