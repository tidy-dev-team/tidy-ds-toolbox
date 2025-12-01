export const loadFonts = async (font?: any) => {
  await figma.loadFontAsync(
    font ? font : { family: "Inter", style: "Regular" },
  );
  await figma.loadFontAsync({ family: "Inter", style: "Regular" });
  await figma.loadFontAsync({ family: "Inter", style: "Bold" });
  await figma.loadFontAsync({ family: "Inter", style: "Semi Bold" });
  await figma.loadFontAsync({ family: "Inter", style: "Medium" });
};
