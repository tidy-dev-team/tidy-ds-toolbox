/// <reference types="@figma/plugin-typings" />

// Usage Guidelines Section (CONTEXT.md "Section", "Specimen Scene"):
// authored whenToUse/whenNotToUse/general bullet lists plus Do/Don't
// specimen pairs. Each pair renders a good and a bad SpecimenScene — 1–4
// live source-component instances in a row/stack, each with a verdict icon
// (code-generated glyph, no library linkage, per ADR-0006).

import { buildAutoLayoutFrame } from "../../sticker-sheet-builder/utils/utilityFunctions";
import {
  buildBulletList,
  buildTitleBlock,
  createText,
  fill,
  FONT_BOLD,
  FONT_REGULAR,
  FONT_SEMIBOLD,
  DOC_SCALE,
  DOC_SPACING,
  TOKENS,
} from "./buildChrome";
import { createSpecimenInstance } from "./specimenFactory";
import type { DocSpec, DoDontPair, SpecimenScene } from "./docSpec";
import type { DerivedFacts } from "./facts";

// The Do/Don't grid's fixed geometry, measured off the approved reference
// page. The description column is fixed so the verdict panels of every row
// line up down the Section; the panels are a floor rather than a fixed size,
// so a component wider or taller than a button grows its pair instead of
// being clipped by it.
const DODONT_DESCRIPTION_WIDTH = 380;
const DODONT_COLUMN_GAP = 40;
const DODONT_PANEL_GAP = 24;
const DODONT_PANEL_MIN_WIDTH = 378;
const DODONT_PANEL_MIN_HEIGHT = 256;
const DODONT_PANEL_RADIUS = 16;
// Breathing room kept between a scene and its panel's edges when the scene is
// too big for the minimum panel and the panel has to grow around it.
const DODONT_PANEL_INSET = 24;
const DODONT_ROW_GAP = 40;

const VERDICT_ICON_SIZE = 20;
const VERDICT_BADGE_PADDING = 16;

const DODONT_CAPTION =
  "Each pair shows the same decision handled well and handled poorly.";

interface VerdictStyle {
  label: string;
  hex: string;
  glyph: string;
  glyphSize: number;
  glyphFont: FontName;
}

// The tick and the cross are set differently on purpose: at a common size the
// cross reads noticeably heavier than the tick inside a 20px disc, so the
// reference sets it smaller and bolder to match the tick's weight.
const VERDICT: Record<"good" | "bad", VerdictStyle> = {
  good: {
    label: "Do",
    hex: TOKENS.verdictGood,
    glyph: "✓",
    glyphSize: 14,
    glyphFont: FONT_REGULAR,
  },
  bad: {
    label: "Don’t",
    hex: TOKENS.verdictBad,
    glyph: "✕",
    glyphSize: 11,
    glyphFont: FONT_BOLD,
  },
};

function createSceneInstance(
  source: ComponentNode | ComponentSetNode,
  props: Record<string, string>,
  facts: DerivedFacts,
): InstanceNode {
  return createSpecimenInstance(source, { facts, overrides: props });
}

export async function buildScene(
  source: ComponentNode | ComponentSetNode,
  scene: SpecimenScene,
  facts: DerivedFacts,
  name: string,
): Promise<FrameNode> {
  const frame = buildAutoLayoutFrame(
    name,
    scene.layout === "stack" ? "VERTICAL" : "HORIZONTAL",
    0,
    0,
    12,
  );
  frame.counterAxisAlignItems = "CENTER";

  for (const instanceSpec of scene.instances) {
    const instance = createSceneInstance(source, instanceSpec.props, facts);
    frame.appendChild(instance);
    if (instanceSpec.labelOverride) {
      const label = await createText(
        instanceSpec.labelOverride,
        11,
        undefined,
        TOKENS.muted,
      );
      frame.appendChild(label);
    }
  }

  return frame;
}

// Kept for the parked vertical layout's Do/Don't grid
// (buildDoDontGridSection), which draws the verdict as a bare inline glyph
// beside its scene rather than as the badge below.
export async function buildVerdictIcon(
  verdict: "good" | "bad",
): Promise<TextNode> {
  return verdict === "good"
    ? createText("✓", 16, FONT_BOLD, TOKENS.good)
    : createText("✗", 16, FONT_BOLD, TOKENS.bad);
}

/** The verdict badge: a filled disc carrying the mark, then the word. */
async function buildVerdictBadge(verdict: "good" | "bad"): Promise<FrameNode> {
  const style = VERDICT[verdict];

  const badge = buildAutoLayoutFrame(
    `do-dont — ${style.label}`,
    "HORIZONTAL",
    VERDICT_BADGE_PADDING,
    VERDICT_BADGE_PADDING,
    DOC_SPACING.title,
  );
  badge.counterAxisAlignItems = "CENTER";

  const disc = buildAutoLayoutFrame("icon", "HORIZONTAL", 0, 0, 0);
  disc.primaryAxisSizingMode = "FIXED";
  disc.counterAxisSizingMode = "FIXED";
  disc.primaryAxisAlignItems = "CENTER";
  disc.counterAxisAlignItems = "CENTER";
  disc.resize(VERDICT_ICON_SIZE, VERDICT_ICON_SIZE);
  disc.cornerRadius = VERDICT_ICON_SIZE / 2;
  fill(disc, style.hex);
  disc.appendChild(
    await createText(
      style.glyph,
      style.glyphSize,
      style.glyphFont,
      TOKENS.white,
    ),
  );

  badge.appendChild(disc);
  badge.appendChild(
    await createText(style.label, DOC_SCALE.rowTitle, FONT_SEMIBOLD, style.hex),
  );

  return badge;
}

/**
 * One verdict panel: the badge over the scene, on a tinted ground.
 *
 * Returned un-sized. The pair's two panels are sized together by
 * `buildDoDontRow`, since a Do panel and a Don't panel of different heights
 * read as two unrelated figures rather than as the comparison they are.
 */
async function buildVerdictPanel(
  source: ComponentNode | ComponentSetNode,
  verdict: "good" | "bad",
  scene: SpecimenScene,
  facts: DerivedFacts,
  name: string,
): Promise<{ panel: FrameNode; specimen: FrameNode }> {
  const panel = buildAutoLayoutFrame(name, "VERTICAL", 0, 0, 0);
  fill(panel, TOKENS.specimenGround);
  panel.cornerRadius = DODONT_PANEL_RADIUS;
  panel.clipsContent = true;

  panel.appendChild(await buildVerdictBadge(verdict));

  const specimen = await buildScene(source, scene, facts, `${name} — specimen`);
  panel.appendChild(specimen);

  return { panel, specimen };
}

/**
 * Size both panels of a pair alike: wide and tall enough for the larger of
 * the two scenes, never below the reference's 378×256 floor.
 *
 * The scenes are measured while both panels still hug, before either is
 * fixed, because a panel already stretched to a floor no longer reports what
 * its content needs.
 */
function sizePanelPair(
  panels: Array<{ panel: FrameNode; specimen: FrameNode }>,
): void {
  const badgeHeight = Math.max(
    ...panels.map(({ panel, specimen }) => panel.height - specimen.height),
  );
  const width = Math.max(
    DODONT_PANEL_MIN_WIDTH,
    ...panels.map(({ specimen }) => specimen.width + DODONT_PANEL_INSET * 2),
  );
  const height = Math.max(
    DODONT_PANEL_MIN_HEIGHT,
    ...panels.map(
      ({ specimen }) => badgeHeight + specimen.height + DODONT_PANEL_INSET * 2,
    ),
  );

  for (const { panel, specimen } of panels) {
    panel.primaryAxisSizingMode = "FIXED";
    panel.counterAxisSizingMode = "FIXED";
    panel.resize(width, height);
    // The scene takes the whole of what the badge leaves and centres itself
    // in it, so specimens sit on one line across the pair however tall the
    // two scenes happen to be.
    //
    // Both sizing modes are fixed rather than one, because which of the
    // scene's own axes carries its width depends on `scene.layout` — a "row"
    // scene is HORIZONTAL and a "stack" is VERTICAL. Leaving either on AUTO
    // lets the scene hug on that axis and ignore the panel it was told to
    // fill, which is how the card's title bar hugged its own text.
    specimen.layoutAlign = "STRETCH";
    specimen.layoutGrow = 1;
    specimen.primaryAxisSizingMode = "FIXED";
    specimen.counterAxisSizingMode = "FIXED";
    specimen.primaryAxisAlignItems = "CENTER";
    specimen.counterAxisAlignItems = "CENTER";
  }
}

/** A text that wraps inside the fixed-width description column. */
function wrapInColumn(text: TextNode): TextNode {
  text.textAutoResize = "HEIGHT";
  text.layoutAlign = "STRETCH";
  return text;
}

async function buildDoDontRow(
  source: ComponentNode | ComponentSetNode,
  pair: DoDontPair,
  facts: DerivedFacts,
  index: number,
): Promise<FrameNode> {
  const name = `do/dont — ${index}`;
  const row = buildAutoLayoutFrame(name, "HORIZONTAL", 0, 0, DODONT_COLUMN_GAP);
  row.counterAxisAlignItems = "MIN";

  const description = buildAutoLayoutFrame(
    `${name} — description`,
    "VERTICAL",
    0,
    0,
    DOC_SPACING.title,
  );
  // Fix the width before the text goes in, so the wrapped lines below are
  // measured against the column they will actually sit in. Height stays on
  // auto-layout's own reckoning — passing the frame's current height rather
  // than a placeholder keeps `resize` off the axis it does not control.
  description.counterAxisSizingMode = "FIXED";
  description.resize(DODONT_DESCRIPTION_WIDTH, Math.max(description.height, 1));
  if (pair.title) {
    description.appendChild(
      wrapInColumn(
        await createText(
          pair.title,
          DOC_SCALE.rowTitle,
          FONT_SEMIBOLD,
          TOKENS.ink,
        ),
      ),
    );
  }
  description.appendChild(
    wrapInColumn(
      await createText(
        pair.description,
        DOC_SCALE.body,
        FONT_REGULAR,
        TOKENS.mutedDark,
      ),
    ),
  );
  row.appendChild(description);

  const panels = buildAutoLayoutFrame(
    `${name} — panels`,
    "HORIZONTAL",
    0,
    0,
    DODONT_PANEL_GAP,
  );
  const built = [
    await buildVerdictPanel(source, "good", pair.good, facts, `${name} — good`),
    await buildVerdictPanel(source, "bad", pair.bad, facts, `${name} — bad`),
  ];
  sizePanelPair(built);
  for (const { panel } of built) panels.appendChild(panel);
  row.appendChild(panels);

  return row;
}

// Pure skip predicate (#72) — whether the Usage Guidelines Section has any
// authored content to render.
export function appliesGuidelinesSection(spec: DocSpec): boolean {
  const guidelines = spec.guidelines;
  if (!guidelines) return false;
  return (
    (guidelines.whenToUse?.length ?? 0) > 0 ||
    (guidelines.whenNotToUse?.length ?? 0) > 0 ||
    (guidelines.general?.length ?? 0) > 0 ||
    (guidelines.doDonts?.length ?? 0) > 0
  );
}

async function buildGuidelineList(
  name: string,
  title: string,
  items: string[],
): Promise<FrameNode> {
  const block = await buildTitleBlock(name, title);
  block.appendChild(await buildBulletList(`${name} — items`, items));
  return block;
}

export async function buildGuidelinesSection(
  source: ComponentNode | ComponentSetNode,
  spec: DocSpec,
  facts: DerivedFacts,
): Promise<FrameNode> {
  const guidelines = spec.guidelines!;

  const section = buildAutoLayoutFrame(
    "guidelines-section",
    "VERTICAL",
    0,
    0,
    DOC_SPACING.section,
  );

  if (guidelines.whenToUse?.length) {
    section.appendChild(
      await buildGuidelineList(
        "guidelines — when to use",
        "When to use",
        guidelines.whenToUse,
      ),
    );
  }
  if (guidelines.whenNotToUse?.length) {
    section.appendChild(
      await buildGuidelineList(
        "guidelines — when not to use",
        "When not to use",
        guidelines.whenNotToUse,
      ),
    );
  }
  if (guidelines.general?.length) {
    section.appendChild(
      await buildGuidelineList(
        "guidelines — general",
        "General",
        guidelines.general,
      ),
    );
  }

  if (guidelines.doDonts?.length) {
    const block = buildAutoLayoutFrame(
      "guidelines — do/dont",
      "VERTICAL",
      0,
      0,
      DOC_SPACING.block,
    );
    block.appendChild(
      await buildTitleBlock("title", "Dos & Don’ts", [DODONT_CAPTION]),
    );

    const rows = buildAutoLayoutFrame(
      "do/dont — rows",
      "VERTICAL",
      0,
      0,
      DODONT_ROW_GAP,
    );
    for (let i = 0; i < guidelines.doDonts.length; i++) {
      rows.appendChild(
        await buildDoDontRow(source, guidelines.doDonts[i], facts, i),
      );
    }
    block.appendChild(rows);

    section.appendChild(block);
  }

  return section;
}
