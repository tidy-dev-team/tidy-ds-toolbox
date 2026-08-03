/**
 * Reading and writing the file's Card Appearance, and asking Figma which fonts
 * this machine can actually draw with. The rules themselves are pure and live
 * in `appearance.ts`.
 */

import type { CardAppearance, CardAppearancePayload } from "../types";
import { CARD_APPEARANCE_KEY, PLUGIN_NAMESPACE } from "./constants";
import { normaliseAppearance, usableFamilies } from "./appearance";

export function getCardAppearance(figma: PluginAPI): CardAppearance {
  const stored = figma.root.getSharedPluginData(
    PLUGIN_NAMESPACE,
    CARD_APPEARANCE_KEY,
  );
  if (!stored) return normaliseAppearance(null);

  try {
    return normaliseAppearance(JSON.parse(stored));
  } catch {
    // A file can hold anything a hand edit left behind. The default draws.
    return normaliseAppearance(null);
  }
}

export function setCardAppearance(
  figma: PluginAPI,
  value: unknown,
): CardAppearance {
  const appearance = normaliseAppearance(value);
  figma.root.setSharedPluginData(
    PLUGIN_NAMESPACE,
    CARD_APPEARANCE_KEY,
    JSON.stringify(appearance),
  );
  return appearance;
}

/**
 * The appearance, plus what the panel needs to show it honestly: the families
 * this machine can offer, and whether the file's own choice is one of them.
 *
 * `fontMissingHere` is why the list is worth sending. The file may name a font
 * a colleague installed and this designer has not, and finding that out when a
 * card comes back in Inter is finding out too late.
 */
export async function getCardAppearancePayload(
  figma: PluginAPI,
): Promise<CardAppearancePayload> {
  const appearance = getCardAppearance(figma);
  const available = await figma.listAvailableFontsAsync();
  const availableFonts = usableFamilies(
    available.map((font) => ({
      family: font.fontName.family,
      style: font.fontName.style,
    })),
  );

  return {
    appearance,
    availableFonts,
    fontMissingHere: !availableFonts.includes(appearance.fontFamily),
  };
}
