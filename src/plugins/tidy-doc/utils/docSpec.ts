// The Doc Spec schema — the boundary object between authored content (an
// LLM, or tidy-doc's own facts-only fallback) and the layout side
// (buildDocPage). Validated at the MCP boundary (mcp-server/src/catalogue.ts
// imports this schema directly) per ADR-0007: hard maximums, presence-only
// minimums, no forced item counts.
//
// All Section keys are now rendered: Variants (#53), Breakdown (#54),
// Mode (#55), Guidelines (#56), and Related (#57). The build orchestrator
// is in utils/buildDocPage.ts.

import { z } from "zod";

export const DOC_STATUSES = [
  "IDEATION",
  "in process",
  "DESIGN COMPLETED",
  "REVIEWING",
  "DEV HAND-OFF",
  "ON HOLD",
  "CANCELED",
  "LIVE",
] as const;

export type DocStatus = (typeof DOC_STATUSES)[number];

const VariantFamilySchema = z.object({
  description: z.string().max(240),
  whenToUse: z.array(z.string().max(120)).max(6).optional(),
});

// Specimen Scene (CONTEXT.md "Specimen"): the constrained vocabulary shared
// by Variants, Mode, and Do/Don't. 1–4 source-component instances, each with
// axis-value refs (bare strings, re-resolved at build per ADR-0008) and an
// optional label, arranged in a row or stack. It cannot place arbitrary
// nodes or other components — a scene outside this vocabulary is simply not
// expressible here.
const SpecimenSceneInstanceSchema = z.object({
  props: z.record(z.string(), z.string()),
  labelOverride: z.string().max(60).optional(),
});

const SpecimenSceneSchema = z.object({
  layout: z.enum(["row", "stack"]),
  instances: z.array(SpecimenSceneInstanceSchema).min(1).max(4),
});

const DoDontPairSchema = z.object({
  description: z.string().max(200),
  good: SpecimenSceneSchema,
  bad: SpecimenSceneSchema,
});

export const DocSpecSchema = z.object({
  status: z.enum(DOC_STATUSES),

  variants: z.record(z.string(), VariantFamilySchema).optional(),

  // Accepted-but-not-yet-rendered slots (full #51 shape). Shape/length is
  // enforced now so authoring against it won't need to change once these
  // Sections render.
  breakdown: z
    .object({
      heightCaption: z.string().max(200).optional(),
      widthCaption: z.string().max(200).optional(),
      iconPlacementCaption: z.string().max(200).optional(),
    })
    .optional(),

  mode: z
    .object({
      caption: z.string().max(200).optional(),
    })
    .optional(),

  guidelines: z
    .object({
      whenToUse: z.array(z.string().max(120)).max(8).optional(),
      whenNotToUse: z.array(z.string().max(120)).max(8).optional(),
      general: z.array(z.string().max(160)).max(8).optional(),
      doDonts: z.array(DoDontPairSchema).max(6).optional(),
    })
    .optional(),

  related: z
    .record(z.string(), z.object({ guidance: z.string().max(160) }))
    .optional(),
});

export type DocSpec = z.infer<typeof DocSpecSchema>;
export type SpecimenScene = z.infer<typeof SpecimenSceneSchema>;
export type DoDontPair = z.infer<typeof DoDontPairSchema>;
