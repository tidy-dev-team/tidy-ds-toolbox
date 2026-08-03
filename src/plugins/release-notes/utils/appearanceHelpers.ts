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
 * What the panel needs on open: the file's appearance, and the families this
 * machine can offer.
 *
 * Read once. Enumerating fonts is the slow part, and doing it again on every
 * save let two saves answer out of order, landing the older value in a panel
 * whose file already held the newer one. The list cannot change while the panel
 * is up, so there is nothing to re-read.
 */
export async function getCardAppearancePayload(
  figma: PluginAPI,
): Promise<CardAppearancePayload> {
  const available = await figma.listAvailableFontsAsync();

  return {
    appearance: getCardAppearance(figma),
    availableFonts: usableFamilies(
      available.map((font) => ({
        family: font.fontName.family,
        style: font.fontName.style,
      })),
    ),
  };
}
