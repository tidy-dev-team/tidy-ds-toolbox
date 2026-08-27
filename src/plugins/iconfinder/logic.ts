/// <reference types="@figma/plugin-typings" />

import { postToUI } from "../../shared/bridge";
import { createModuleListeners } from "../../shared/module-listeners";

const listeners = createModuleListeners("iconfinder");

function ensureListeners(): void {
  // This module used to guard the handler with an `isActive` flag that its panel
  // set by posting `stop` on unmount - a second mechanism answering the question
  // `module-deactivated` now answers for every module. The listener is simply
  // gone while another module is showing, so there is nothing to guard against.
  // See `src/shared/module-listeners.ts`.
  listeners.ensure(() => [
    {
      type: "selectionchange",
      handler: () => {
        void handleSelectionChange();
      },
    },
  ]);
}

async function handleSelectionChange(): Promise<void> {
  const selection = figma.currentPage.selection;

  if (selection.length === 0) {
    postToUI({ type: "no-selection" });
    return;
  }

  postToUI({ type: "loading" });

  const nodes = await Promise.all(
    selection.map(async (node) => {
      const bytes = await node.exportAsync({
        format: "PNG",
        constraint: { type: "WIDTH", value: 64 },
      });
      const png = uint8ArrayToBase64(bytes);
      return {
        id: node.id,
        name: node.name,
        type: node.type,
        png,
      };
    }),
  );

  postToUI({
    type: "analyze-png",
    payload: { nodes },
  });
}

function uint8ArrayToBase64(bytes: Uint8Array): string {
  let binary = "";
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

export async function iconFinderHandler(
  action: string,
  _payload: unknown,
): Promise<void> {
  ensureListeners();

  switch (action) {
    case "start": {
      // Analyse what is already selected, rather than waiting for the designer
      // to reselect it. Installing the listener is `ensureListeners` above.
      await handleSelectionChange();
      return;
    }
    default:
      console.warn(`[iconfinder] Unknown action: ${action}`);
      return;
  }
}
