/// <reference types="@figma/plugin-typings" />

// Orchestrator: derive facts, resolve references, replace-wholesale rebuild,
// render Chrome + Sections. Not unit tested (Figma-API adapter) — validated
// by manual round-trip in Figma per the plan's verification section.

import { ErrorCode, OperationError } from "../../../shared/operations/errors";
import { withDocPageBuildLock, type BuildOrigin } from "./buildLock";
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
import { DEFAULT_DOC_LAYOUT, type DocLayout } from "./docLayout";
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

/**
 * Builds a Documentation Page, holding the builder's lock for `source` while
 * it runs.
 *
 * Two guards stand in front of this builder and they answer different
 * questions. Neither is redundant, and deleting either reopens a real hole:
 *
 * - The Operation registry (`src/shared/operations/registry.ts`, #186) answers
 *   "is another Operation running", globally, for the agent-facing path only.
 * - This lock (`buildLock.ts`, #187) answers "is this page already being
 *   built", for whichever route asked.
 *
 * The second route this lock was written for no longer exists. #187 added it
 * because the panel's Document button reached this builder through the
 * module-action path and never passed through `dispatch`; that button and the
 * whole Tidy Doc panel were removed when documentation became something only
 * Claude initiates. `operations.ts` is now the only caller, and it always
 * passes "agent".
 *
 * So `origin` has one producer and `BuildOrigin`'s "panel" has none. Both are
 * left here rather than collapsed in the same change, because whether the lock
 * survives at all is #187's AC4 question - "exactly one mechanism answers this"
 * - and that deserves its own decision (#211). Nothing new should be built on
 * either.
 */
export async function buildDocPage(
  source: ComponentNode | ComponentSetNode,
  spec: DocSpec,
  origin: BuildOrigin,
): Promise<FrameNode> {
  return await withDocPageBuildLock(
    { sourceId: source.id, sourceName: source.name, origin },
    () => buildDocPageUnguarded(source, spec),
  );
}

async function buildDocPageUnguarded(
  source: ComponentNode | ComponentSetNode,
  spec: DocSpec,
): Promise<FrameNode> {
  // Fixed, and the single place that fixes it (ADR-0010). The vertical branch
  // below is parked on purpose - the sections, the header builder and the
  // chrome-less assembly path are all still here and still compiled - but
  // there is no longer any way to select it: no panel control, no persisted
  // setting, no override parameter, and nothing in the Doc Spec. Bringing it
  // back is a one-line change here, which is the intended cost.
  //
  // Typed as the union rather than inferred, so the branch stays live code
  // instead of something the compiler narrows away.
  const layout: DocLayout = DEFAULT_DOC_LAYOUT;
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
