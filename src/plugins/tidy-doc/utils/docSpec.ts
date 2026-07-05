// The Doc Spec schema — the boundary object between authored content (an
// LLM, or tidy-doc's own facts-only fallback) and the layout side
// (buildDocPage). Validated at the MCP boundary (mcp-server/src/catalogue.ts
// imports this schema directly) per ADR-0007: hard maximums, presence-only
// minimums, no forced item counts.
//
// v1 (#52 tracer bullet) renders only `status` + `variants`. The remaining
// Section keys are accepted here so a later slice (#51) doesn't need a
// breaking schema change, but nothing builds them yet — see
// utils/buildDocPage.ts.

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

export const DocSpecSchema = z.object({
  status: z.enum(DOC_STATUSES),

  variants: z.record(z.string(), VariantFamilySchema).optional(),

  // Accepted-but-not-yet-rendered slots (full #51 shape). Shape/length is
  // enforced now so authoring against it won't need to change once these
  // Sections render; `doDonts` (a SpecimenScene) is omitted — there is no
  // renderer to validate that decision against yet.
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
    })
    .optional(),

  related: z
    .record(z.string(), z.object({ guidance: z.string().max(160) }))
    .optional(),
});

export type DocSpec = z.infer<typeof DocSpecSchema>;
