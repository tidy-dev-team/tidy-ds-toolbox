# Product Requirements Document (PRD)

## On-Canvas QA Checklist — generated report for a component instance

**Status:** proposed · **Tracking issue:** #90 · **Parent:** [`docs/prd-automated-qa.md`](prd-automated-qa.md) (the Tier-1 QA engine)

## 1. Summary

Today `tidy_qa_run` (Tier 1, 9 checks) returns a large structured JSON report to
the agent. On a 64-variant set that is ~600 findings / >170K chars — it overflows
the MCP token ceiling and doesn't fit how designers actually work.

This PRD adds a second, **canvas-native** surface: a designer selects a component
**instance** placed in a "QA" frame, runs one command, and the plugin **renders a
filled-in QA checklist as a frame next to the instance**. The checking still walks
the full component set (nothing lost); the *result* is drawn on the canvas rather
than returned to the cloud, so the token-size problem disappears and the output
lands where the designer already reviews.

## 2. Motivating workflow (from the design team)

1. A designer drops a component **instance** into a frame on a page (named `QA`
   or similar).
2. Next to it they place the **DS Component QA Checklist** (the 19-item list from
   [`prd-automated-qa.md`](prd-automated-qa.md)).
3. They manually switch variant-by-variant, checking every property, layer, and
   state, ticking items off.

We cannot replace the designer's judgement on every item, but we can **automate
the 9 machine-checkable items and pre-fill the shared checklist artifact**, so the
designer is left only with the items that genuinely need a human. The generated
artifact *is* their checklist — not a second thing to reconcile.

## 3. Goals / non-goals

**Goals**
- Target a **single instance** (ergonomic — it's already sitting in the QA frame),
  resolve **up** to its owning component set, and run the full existing check
  engine over all variants. **Completeness is preserved.**
- Render **all 19** checklist items as a frame on the canvas, positioned next to
  the instance: the 9 automated items filled with status + findings; the other 10
  as manual checkboxes.
- Return only a **small stub** over MCP (frame id + pass/warn/fail counts) — never
  the full findings payload.
- Keep the **rendering isolated in its own module** so the visual design can be
  swapped later without touching the checking logic.

**Non-goals**
- Not automating the 10 manual items (separate future work; Tier 2 will convert
  some of them).
- Not changing `tidy_qa_run` — the read-only JSON query stays for agent use.
- Not matching a specific existing checklist artifact pixel-for-pixel (fresh
  design; see §7).

## 4. Architecture — data / render split

```
existing:  collector → snapshot → check engine (9 pure checks)  [unchanged]

new:
  ┌─ report model (pure, testable) ─────────────┐   ┌─ renderer (Figma, isolated) ─┐
  │ all 19 checklist items:                     │   │ (report model, target        │
  │   { n, title, tier, checkId?, automated,    │ → │  instance) → checklist frame │
  │     status, findings[] }                    │   │  placed next to the instance │
  │ built by merging check results with the     │   │  reuses tidy-doc code-as-    │
  │ static 19-item catalogue                    │   │  template rendering approach │
  └──────────────────────────────────────────────┘   └──────────────────────────────┘
                                     │
                       new execute operation: tidy_qa_build_checklist
```

Three new pieces, plus one operation:

1. **19-item catalogue** (`src/plugins/qa/checklist-catalogue.ts`, pure) — the
   static list of all 19 PRD items: `{ n, title, tier, checkId? }`. The single
   source that maps PRD sections to the engine's check ids.
2. **Report model** (`src/plugins/qa/report.ts`, pure) — merges the engine's
   `CheckResult[]` with the catalogue into a `ChecklistReport`: one row per item,
   with a resolved `status` (`pass` / `warn` / `fail` / `not_applicable` for
   automated items that ran, per the engine's own `CheckStatus`; `manual` for
   un-automated items; `not_implemented` for catalogued-but-unbuilt automated
   items). Fully unit-testable, no Figma.
3. **Renderer** (`src/plugins/qa/render/`, Figma-touching, **isolated**) — takes a
   `ChecklistReport` + the target instance and builds the frame, positioning it
   beside the instance. The only piece that touches `figma.*` for output; the
   replaceable design surface.
4. **Operation** `tidy_qa_build_checklist` (`kind: "execute"`) — orchestrates:
   resolve target instance → set, run engine, build report, render, return stub.

### Item → check mapping

| PRD # | Item | Automated by |
|------|------|--------------|
| 1 | Storybook Alignment + Note | manual |
| 2 | Components Naming Dev Alignment | `set-name-casing` |
| 3 | Check All the Props | manual |
| 4 | Prop Names Aligned to Catalogue | `prop-order` |
| 5 | Tokens (Styles & Variables) | `tokens` |
| 6 | Typography Desktop\|Mobile | manual |
| 7 | Responsiveness (+ Min-Max) | manual |
| 8 | Icons/Illustrations/Logos → Foundations | manual (Tier 2) |
| 9 | Layer Naming + Structure | `layer-naming-structure` |
| 10 | 4px Grid Alignment | `grid-4px` |
| 11 | Interaction (Hover Only) | `interaction-hover-only` |
| 12 | Description (AKA + Misprint) | `description` |
| 13 | No Conflicts | `no-conflicts` |
| 14 | Easy to Use (Nested Components) | manual |
| 15 | Preferred (Instance Swapping) | `preferred-values` |
| 16 | High Contrast (A11y) | manual |
| 17 | Themes (Core/DNA/OldNews) | manual |
| 18 | Page Template | manual |
| 19 | Documentation | manual |

## 5. Operation contract

`tidy_qa_build_checklist` — **execute** (mutates the canvas).

**Params**
- `nodeId?` — the target. Intended to be an **instance**, but accepts any
  component / component set / instance and resolves up to the owning set (reuses
  the existing `resolveUp`). Omit to use the current selection.
- `checks?` — optional check-id filter (same semantics as `tidy_qa_run`); the
  filtered-out automated rows render as "not run" rather than pass/fail.
- `anchorNodeId?` — optional: place the checklist next to this node instead of the
  resolved target (lets the designer keep the frame by the *instance* even though
  checks ran against the *set*). Defaults to the passed instance / selection.

**Returns (stub only)**
```
{ frameId: string, target: { id, name }, counts: { pass, warn, fail, manual, notImplemented } }
```

**Behaviour**
- **Idempotent per target**, like `tidy_doc_build_page`: re-running deletes the
  previous checklist frame for that target and rebuilds fresh (tagged via plugin
  data so it can be found and replaced).
- Placement: adjacent to the anchor (default: to the right, matching tidy-doc's
  placement convention), not overlapping it.
- Static toward the source component — it only *reads* the set; it *writes* only
  the new checklist frame.

**Errors** (uniform contract, ADR-0003)
- `INVALID_PARAMS` — no target and nothing selected.
- `WRONG_NODE_TYPE` — target doesn't resolve to a component set.
- `NOT_FOUND` — node id / name matched nothing.
- `BRIDGE_DISCONNECTED` — plugin not open in Figma.

## 6. Report model (sketch)

```ts
type ItemStatus =
  | "pass"
  | "warn"
  | "fail"
  | "not_applicable" // the check ran but had nothing to evaluate (e.g. no
                      // instance-swap properties) — kept distinct from
                      // `pass`, which would otherwise overstate coverage
  | "manual"
  | "not_implemented"
  | "not_run";

interface ChecklistItem {
  n: number;              // 1..19
  title: string;
  tier: 1 | 2 | null;     // null = manual-only item
  checkId?: CheckId;      // present when an engine check backs it
  automated: boolean;
  status: ItemStatus;
  findings: Finding[];    // from the engine; empty for manual/pass/not_applicable
}

interface ChecklistReport {
  target: { id: string; name: string };
  generatedFor: { instanceId?: string };  // the instance the run started from
  items: ChecklistItem[];  // always 19, in PRD order
  counts: Record<"pass" | "warn" | "fail" | "manual" | "notImplemented", number>;
}
```

## 7. Renderer requirements

- **Isolated module** (`render/`) — swappable without touching checking. The
  operation depends on a single `renderChecklist(report, anchor)` entry point.
- **Fresh design**, built for legibility on canvas: a titled frame, one row per
  item showing number, title, a status chip (pass/warn/fail/manual), and, for
  items with findings, a compact grouped summary (dedupe repeated per-node
  findings with counts — the visual analogue of the aggregation TODO).
- Manual items render with an empty checkbox for the designer to tick.
- Reuse the `tidy-doc` code-as-template layout approach (ADR-0006) for visual
  consistency with other generated artifacts.

## 8. Testing

- **Pure, TDD-first:** the 19-item catalogue and the report model
  (`checklist-catalogue.test.ts`, `report.test.ts`) — assert all 19 items present
  and ordered, correct check→item mapping, and status resolution (automated
  pass/warn/fail, manual, not_implemented, not_run when filtered).
- **Renderer / operation:** Figma-touching, verified manually in-file (consistent
  with the untested collector/operation boundary today). Keep rendering logic thin
  and driven by the report model so most correctness lives in the pure layer.

## 9. Phasing

1. **Report layer** — catalogue + report model + tests. No Figma. (Ships value:
   `tidy_qa_run` could optionally return the 19-item model too.)
2. **Renderer** — `render/` module + `renderChecklist`.
3. **Operation** — `tidy_qa_build_checklist`, catalogue entry, `/tidy-qa` command
   gains a `--render` / canvas mode (or a sibling `/tidy-qa-checklist` command),
   docs, assemble check.
4. **Idempotency + placement polish.**

## 10. Acceptance criteria

- Selecting an instance and running the command renders a checklist frame beside
  it covering **all 19 items**, with the 9 automated ones showing real
  pass/warn/fail + grouped findings and the rest as manual checkboxes.
- Checking walks the full set (same coverage as `tidy_qa_run`).
- The MCP call returns only the stub — no large payload.
- Re-running replaces the prior frame for that target (no duplicates).
- The renderer is a self-contained module the design can be changed in without
  editing checking logic.

## 11. Open questions

- One command with a canvas mode vs. a separate `/tidy-qa-checklist` command.
- Where exactly to anchor when the instance and the set live on different pages.
- Whether manual-item checkbox state should persist across re-runs (probably not
  in v1 — re-run rebuilds fresh).
