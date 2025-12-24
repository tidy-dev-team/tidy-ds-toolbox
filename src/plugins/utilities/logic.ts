/// <reference types="@figma/plugin-typings" />

import { UtilitiesAction, UtilityResult } from "./types";
import { runAddressNote } from "./utils/addressNote";
import { runImageWrapper } from "./utils/imageWrapper";

/**
 * Utilities handler - processes messages from the UI
 * Routes to individual utility functions
 */
export async function utilitiesHandler(
  action: string,
  _payload: any,
  _figma?: PluginAPI,
): Promise<UtilityResult> {
  switch (action as UtilitiesAction) {
    case "address-note":
      return await runAddressNote();

    case "image-wrapper":
      return await runImageWrapper();

    default:
      return {
        success: false,
        message: `Unknown utilities action: ${action}`,
      };
  }
}
