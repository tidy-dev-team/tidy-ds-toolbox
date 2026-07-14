/// <reference types="@figma/plugin-typings" />

// Vertical layout — Header (#64): component name + status badge, built from
// primitives. Intentionally plain — no branded chrome (out of scope, #62).

import { buildAutoLayoutFrame } from "../../sticker-sheet-builder/utils/utilityFunctions";
import { buildStatusBadge, createText, FONT_BOLD } from "./buildChrome";
import type { DocStatus } from "./docSpec";

export async function buildVerticalHeader(
  componentName: string,
  status: DocStatus,
): Promise<FrameNode> {
  const header = buildAutoLayoutFrame("header", "HORIZONTAL", 0, 0, 12);
  header.counterAxisAlignItems = "CENTER";

  const title = await createText(componentName, 22, FONT_BOLD);
  const badge = await buildStatusBadge(status);

  header.appendChild(title);
  header.appendChild(badge);

  return header;
}
