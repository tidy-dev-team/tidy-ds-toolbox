/// <reference types="@figma/plugin-typings" />

// Orchestrator: derive facts, resolve references, replace-wholesale rebuild,
// render Chrome + Sections. Not unit tested (Figma-API adapter) — validated
// by manual round-trip in Figma per the plan's verification section.

import { ErrorCode, OperationError } from "../../../shared/operations/errors";
import { buildAutoLayoutFrame } from "../../sticker-sheet-builder/utils/utilityFunctions";
import { deriveFacts } from "./deriveFacts";
import { resolveDocSpecReferences } from "./resolveReferences";
import { buildSectionCard } from "./buildChrome";
import {
  buildVariantsSection,
  appliesVariantsSection,
} from "./buildVariantsSection";
import {
  buildBreakdownSection,
  appliesBreakdownSection,
} from "./buildBreakdownSection";
import { buildModeSection, appliesModeSection } from "./buildModeSection";
import {
  buildGuidelinesSection,
  appliesGuidelinesSection,
} from "./buildGuidelinesSection";
import {
  buildRelatedSection,
  appliesRelatedSection,
} from "./buildRelatedSection";
import { buildVerticalHeader } from "./buildVerticalHeader";
import { buildVariantMatrixSection } from "./buildVariantMatrixSection";
import {
  buildConstraintsSection,
  appliesConstraintsSection,
} from "./buildConstraintsSection";
import {
  buildDoDontGridSection,
  appliesDoDontGridSection,
} from "./buildDoDontGridSection";
import { getPersistedDocLayout, type DocLayout } from "./docLayout";
import type { DocSpec } from "./docSpec";
import type { DerivedFacts } from "./facts";

// One Section, as the orchestrator sees it (#72): a pure `applies` predicate
// deciding whether it renders at all, and a `render` that builds its body —
// the two concerns the four `assemble*` copy-paste blocks used to fuse
// together per Section. `id`/`title` feed the horizontal layout's Chrome
// card (buildSectionCard); the vertical layout ignores them.
interface SectionContext {
  source: ComponentNode | ComponentSetNode;
  spec: DocSpec;
  facts: DerivedFacts;
}

interface SectionDescriptor {
  id: string;
  title: string;
  applies: (ctx: SectionContext) => boolean;
  render: (ctx: SectionContext) => Promise<FrameNode>;
}

// Vertical layout's Sections (#64/#66/#67): Component Variants matrix always
// applies; Constraints and Dos/Don'ts render un-chromed, directly on root.
const VERTICAL_SECTIONS: SectionDescriptor[] = [
  {
    id: "matrix",
    title: "Component Variants",
    applies: () => true,
    render: ({ source, facts }) => buildVariantMatrixSection(source, facts),
  },
  {
    id: "constraints",
    title: "Constraints",
    applies: ({ facts }) => appliesConstraintsSection(facts),
    render: ({ source, facts }) => buildConstraintsSection(source, facts),
  },
  {
    id: "dodont",
    title: "Dos and Don'ts",
    applies: ({ spec }) => appliesDoDontGridSection(spec),
    render: ({ source, spec, facts }) =>
      buildDoDontGridSection(source, spec, facts),
  },
];

// Horizontal layout's Sections: each renders inside its own Chrome card
// (#63), skipped wholesale — card included — when it has nothing to show.
const HORIZONTAL_SECTIONS: SectionDescriptor[] = [
  {
    id: "variants",
    title: "Variants",
    applies: ({ spec }) => appliesVariantsSection(spec),
    render: ({ source, spec, facts }) =>
      buildVariantsSection(source, spec, facts),
  },
  {
    id: "breakdown",
    title: "Component Breakdown",
    applies: ({ facts, spec }) => appliesBreakdownSection(facts, spec),
    render: ({ source, spec, facts }) =>
      buildBreakdownSection(source, spec, facts),
  },
  {
    id: "mode",
    title: "Mode",
    applies: ({ facts, spec }) => appliesModeSection(facts, spec),
    render: ({ source, spec, facts }) => buildModeSection(source, spec, facts),
  },
  {
    id: "guidelines",
    title: "Usage Guidelines",
    applies: ({ spec }) => appliesGuidelinesSection(spec),
    render: ({ source, spec, facts }) =>
      buildGuidelinesSection(source, spec, facts),
  },
  {
    id: "related",
    title: "Related Components",
    applies: ({ spec }) => appliesRelatedSection(spec),
    render: ({ spec, facts }) => buildRelatedSection(spec, facts),
  },
];

const PLUGIN_DATA_KEY = "tidy:doc-page";

interface DocPageStamp {
  version: number;
  sourceComponentId: string;
  builtAt: number;
}

// Guards against two concurrent builds for the same source (e.g. a client
// retrying after a timeout while the first call is still running): without
// this, both calls see no existing stamped page and each builds its own.
const buildsInFlight = new Set<string>();

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

// An explicit layout override, for tests and future callers — both current
// callers (the MCP operation and the panel fallback) pass nothing and rely
// on the persisted panel setting resolved internally below.
export async function buildDocPage(
  source: ComponentNode | ComponentSetNode,
  spec: DocSpec,
  layoutOverride?: DocLayout,
): Promise<FrameNode> {
  if (buildsInFlight.has(source.id)) {
    throw new OperationError(
      ErrorCode.BUSY,
      `A Documentation Page build for ${source.name} is already in progress`,
      true,
    );
  }
  buildsInFlight.add(source.id);

  try {
    return await buildDocPageUnguarded(source, spec, layoutOverride);
  } finally {
    buildsInFlight.delete(source.id);
  }
}

async function buildDocPageUnguarded(
  source: ComponentNode | ComponentSetNode,
  spec: DocSpec,
  layoutOverride?: DocLayout,
): Promise<FrameNode> {
  const layout = layoutOverride ?? (await getPersistedDocLayout());
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
    layout === "vertical" ? "VERTICAL" : "HORIZONTAL",
    24,
    24,
    24,
  );

  // Place and stamp the frame immediately, before the slow section builds
  // below, so a concurrent/retried call's findExistingDocPages scan sees it
  // and replaces it instead of building a second, independent page.
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

  const ctx: SectionContext = { source, spec, facts };
  if (layout === "vertical") {
    const header = await buildVerticalHeader(source.name, spec.status);
    root.appendChild(header);
    await assembleSections(root, ctx, VERTICAL_SECTIONS, { chrome: false });
  } else {
    await assembleSections(root, ctx, HORIZONTAL_SECTIONS, { chrome: true });
  }

  figma.viewport.scrollAndZoomIntoView([root]);

  return root;
}

// One loop, either layout (#72): test `applies`, skip wholesale (Chrome card
// included) when it doesn't, else render and attach — chromed via
// buildSectionCard for the horizontal layout, appended directly for the
// vertical one. Replaces the two hand-unrolled assemble* routines that used
// to thread each Section's identity through repeated string literals and a
// 5×-repeated Chrome-wrap block.
async function assembleSections(
  root: FrameNode,
  ctx: SectionContext,
  descriptors: SectionDescriptor[],
  options: { chrome: boolean },
): Promise<void> {
  for (const descriptor of descriptors) {
    if (!descriptor.applies(ctx)) continue;
    const rendered = await descriptor.render(ctx);
    if (options.chrome) {
      const { card, body } = await buildSectionCard(
        descriptor.id,
        descriptor.title,
        ctx.source.name,
        ctx.spec.status,
      );
      body.appendChild(rendered);
      root.appendChild(card);
    } else {
      root.appendChild(rendered);
    }
  }
}
