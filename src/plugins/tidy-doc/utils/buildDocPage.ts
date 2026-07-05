/// <reference types="@figma/plugin-typings" />

// Orchestrator: derive facts, resolve references, replace-wholesale rebuild,
// render Chrome + Sections. Not unit tested (Figma-API adapter) — validated
// by manual round-trip in Figma per the plan's verification section.

import { ErrorCode, OperationError } from "../../../shared/operations/errors";
import { buildAutoLayoutFrame } from "../../sticker-sheet-builder/utils/utilityFunctions";
import { deriveFacts } from "./deriveFacts";
import { resolveDocSpecReferences } from "./resolveReferences";
import { buildSectionCard } from "./buildChrome";
import { buildVariantsSection } from "./buildVariantsSection";
import { buildBreakdownSection } from "./buildBreakdownSection";
import { buildModeSection } from "./buildModeSection";
import { buildGuidelinesSection } from "./buildGuidelinesSection";
import { buildRelatedSection } from "./buildRelatedSection";
import type { DocSpec } from "./docSpec";

const PLUGIN_DATA_KEY = "tidy:doc-page";

interface DocPageStamp {
  version: number;
  sourceComponentId: string;
  builtAt: number;
}

// Scans every page (not just the current one) and every depth (not just
// top-level children), since re-runs must find a stamped page regardless of
// which page or frame a designer moved it into between runs (#52 ACR).
async function findExistingDocPages(
  sourceComponentId: string,
): Promise<FrameNode[]> {
  await figma.loadAllPagesAsync();
  const matches: FrameNode[] = [];
  for (const frame of figma.root.findAllWithCriteria({ types: ["FRAME"] })) {
    const raw = frame.getPluginData(PLUGIN_DATA_KEY);
    if (!raw) continue;
    try {
      const stamp = JSON.parse(raw) as DocPageStamp;
      if (stamp.sourceComponentId === sourceComponentId) {
        matches.push(frame);
      }
    } catch {
      // Not a doc-page stamp we understand — ignore.
    }
  }
  return matches;
}

export async function buildDocPage(
  source: ComponentNode | ComponentSetNode,
  spec: DocSpec,
): Promise<FrameNode> {
  const facts = await deriveFacts(source);

  const { unresolved } = resolveDocSpecReferences(spec, facts);
  if (unresolved.length > 0) {
    throw new OperationError(
      ErrorCode.INVALID_PARAMS,
      `${unresolved.length} Doc Spec reference(s) did not resolve`,
      true,
      { unresolved },
    );
  }

  const page = figma.currentPage;
  const existing = await findExistingDocPages(source.id);
  if (existing.length > 0) {
    if (existing.length > 1) {
      console.warn(
        `tidy-doc: found ${existing.length} existing doc pages for ${source.id}; deleting all before rebuild`,
      );
    }
    for (const frame of existing) frame.remove();
  }

  const root = buildAutoLayoutFrame(
    `Documentation — ${source.name}`,
    "VERTICAL",
    0,
    0,
    0,
  );

  const { card, body } = await buildSectionCard(
    "variants",
    "Variants",
    source.name,
    spec.status,
  );
  const variantsSection = await buildVariantsSection(source, spec, facts);
  if (variantsSection) body.appendChild(variantsSection);
  root.appendChild(card);

  const breakdownSection = await buildBreakdownSection(source, spec, facts);
  if (breakdownSection) {
    const { card: breakdownCard, body: breakdownBody } = await buildSectionCard(
      "breakdown",
      "Component Breakdown",
      source.name,
      spec.status,
    );
    breakdownBody.appendChild(breakdownSection);
    root.appendChild(breakdownCard);
  }

  const modeSection = await buildModeSection(source, spec, facts);
  if (modeSection) {
    const { card: modeCard, body: modeBody } = await buildSectionCard(
      "mode",
      "Mode",
      source.name,
      spec.status,
    );
    modeBody.appendChild(modeSection);
    root.appendChild(modeCard);
  }

  const guidelinesSection = await buildGuidelinesSection(source, spec, facts);
  if (guidelinesSection) {
    const { card: guidelinesCard, body: guidelinesBody } =
      await buildSectionCard(
        "guidelines",
        "Usage Guidelines",
        source.name,
        spec.status,
      );
    guidelinesBody.appendChild(guidelinesSection);
    root.appendChild(guidelinesCard);
  }

  const relatedSection = await buildRelatedSection(spec, facts);
  if (relatedSection) {
    const { card: relatedCard, body: relatedBody } = await buildSectionCard(
      "related",
      "Related Components",
      source.name,
      spec.status,
    );
    relatedBody.appendChild(relatedSection);
    root.appendChild(relatedCard);
  }

  page.appendChild(root);
  root.x = source.x + source.width + 200;
  root.y = source.y;

  root.setPluginData(
    PLUGIN_DATA_KEY,
    JSON.stringify({
      version: 1,
      sourceComponentId: source.id,
      builtAt: Date.now(),
    } satisfies DocPageStamp),
  );

  figma.viewport.scrollAndZoomIntoView([root]);

  return root;
}
