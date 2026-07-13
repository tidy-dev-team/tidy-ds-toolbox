/// <reference types="@figma/plugin-typings" />

// Vertical layout — Dos and Don'ts grid (#67): a grid of framed examples —
// green + check for "do", red + cross for "don't" — each with a caption.
// Reuses the specimen-scene and verdict-glyph renderers exposed by the
// Guidelines section (#63 prefactor), re-framed as colored panels. Reads
// from the do/don't pairs already authored in the Doc Spec — no new
// authored content, no schema change. Omitted when there is none.

import { buildAutoLayoutFrame } from "../../sticker-sheet-builder/utils/utilityFunctions";
import { createText, buildSectionTitle } from "./buildChrome";
import { buildScene, buildVerdictIcon } from "./buildGuidelinesSection";
import type { DocSpec, SpecimenScene } from "./docSpec";
import type { DerivedFacts } from "./facts";

const GOOD_BORDER = "#16A34A";
const BAD_BORDER = "#DC2626";

function hexToRgb(hex: string): RGB {
  const clean = hex.replace("#", "");
  return {
    r: parseInt(clean.slice(0, 2), 16) / 255,
    g: parseInt(clean.slice(2, 4), 16) / 255,
    b: parseInt(clean.slice(4, 6), 16) / 255,
  };
}

async function buildFramedPanel(
  source: ComponentNode | ComponentSetNode,
  verdict: "good" | "bad",
  scene: SpecimenScene,
  caption: string,
  facts: DerivedFacts,
  name: string,
): Promise<FrameNode> {
  const panel = buildAutoLayoutFrame(name, "VERTICAL", 16, 16, 8);
  panel.cornerRadius = 8;
  panel.strokeWeight = 1;
  // Border only — no fill; the colored stroke alone signals good vs bad.
  panel.fills = [];
  panel.strokes = [
    {
      type: "SOLID",
      color: hexToRgb(verdict === "good" ? GOOD_BORDER : BAD_BORDER),
    },
  ];

  const header = buildAutoLayoutFrame(
    `${name} — header`,
    "HORIZONTAL",
    0,
    0,
    8,
  );
  header.counterAxisAlignItems = "CENTER";
  header.fills = []; // transparent — no default white background
  header.appendChild(await buildVerdictIcon(verdict));
  header.appendChild(await createText(caption, 12, undefined, "#111827"));
  panel.appendChild(header);

  const sceneFrame = await buildScene(source, scene, facts, `${name} — scene`);
  sceneFrame.fills = []; // transparent — no default white background
  panel.appendChild(sceneFrame);

  return panel;
}

export async function buildDoDontGridSection(
  source: ComponentNode | ComponentSetNode,
  spec: DocSpec,
  facts: DerivedFacts,
): Promise<FrameNode | null> {
  const doDonts = spec.guidelines?.doDonts;
  if (!doDonts?.length) return null;

  const section = buildAutoLayoutFrame(
    "dodont-grid-section",
    "VERTICAL",
    0,
    0,
    24,
  );
  section.layoutAlign = "STRETCH";
  section.appendChild(await buildSectionTitle("Dos and Don'ts"));

  for (let i = 0; i < doDonts.length; i++) {
    const pair = doDonts[i];
    const row = buildAutoLayoutFrame(`dodont — ${i}`, "HORIZONTAL", 0, 0, 16);
    row.appendChild(
      await buildFramedPanel(
        source,
        "good",
        pair.good,
        pair.description,
        facts,
        `dodont — ${i} — good`,
      ),
    );
    row.appendChild(
      await buildFramedPanel(
        source,
        "bad",
        pair.bad,
        pair.description,
        facts,
        `dodont — ${i} — bad`,
      ),
    );
    section.appendChild(row);
  }

  return section;
}
