/// <reference types="@figma/plugin-typings" />

import { postToUI } from "../../shared/bridge";

let listenersRegistered = false;
let isActive = false;

function ensureListeners(): void {
  if (listenersRegistered) {
    return;
  }
  listenersRegistered = true;

  figma.on("selectionchange", () => {
    void handleSelectionChange();
  });
}

function setActive(active: boolean): void {
  isActive = active;
}

async function handleSelectionChange(): Promise<void> {
  // Active-module guard: do no work while another module is showing.
  if (!isActive) {
    return;
  }

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
      setActive(true);
      await handleSelectionChange();
      return;
    }
    case "stop": {
      setActive(false);
      return;
    }
    default:
      console.warn(`[iconfinder] Unknown action: ${action}`);
      return;
  }
}
