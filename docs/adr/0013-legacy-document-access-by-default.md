# Legacy whole-document access, taken by default and kept by choice

`manifest.json` declares no `documentAccess` field, so the plugin runs under Figma's legacy whole-document access: every page is loaded when the plugin starts.

Nobody chose that.
Most modules predate dynamic page access, and the project took the default.
Staying on it *is* now a choice, and the reasons are below, which is the difference this ADR exists to record.
Without it the newer code reads as though a migration were under way, and it is not.

## What the code actually looks like

Nine files call `figma.loadAllPagesAsync()`: the agent-facing entry points in `utilities` and `ds-explorer`, the QA Operation and three QA renderers, and three `tidy-doc` utilities.
Those are the newest parts of the repository, written by people who had the newer model in mind.

Twenty-seven lines across fourteen files read `figma.root.children` synchronously.
The concentrations are `off-boarding/logic.ts` (7), then `release-notes` (4), `sticker-sheet-builder` (4), `audit` (4) and `color-finder` (3).

Most of those reads are not the problem.
Enumerating pages, and reading each page's `id` and `name`, stays legal under dynamic page access; `off-boarding`'s page list and `color-finder`'s page picker do exactly that and would keep working untouched.
What breaks is walking a page's **contents** without loading that page first.

The clear examples are `release-notes/render/publish.ts`, which iterates `page.children` for every page in the file to find and sweep its cards, and `off-boarding`'s pack path, which clones the children of each source page.
`audit`, `sticker-sheet-builder` and `color-finder` each reach page contents on at least one path as well.
None of those five modules calls `loadAllPagesAsync` anywhere.

So the split is real, and it is narrower than the raw read counts suggest.
It is two generations of code under one manifest that happens to support both.

## Why we are not migrating now

Two facts, both recorded on 2026-08-03 in `docs/audit-2026-08-review.md`, section 8, items 12 and 13:

- **Distribution stays private for the foreseeable future.** The plugin is installed by manifest import and distributed through Google Drive. There is no submission to the Figma Community, and Community review is where a document-access requirement would land as a hard gate.
- **Nothing is broken today.** Legacy access is supported, and the modules that read pages synchronously work.

The migration's cost sits in five modules, three of which have no tests at all (`off-boarding`, `sticker-sheet-builder` and `audit`), and three of which mutate pages.
That is the same surface as the module-testing effort in issue #157, so the work should ride with it rather than compete with it.

Considered and rejected: declaring `documentAccess: "dynamic-page"` now and fixing what breaks.
Rejected because the modules it would break are exactly the destructive, untested ones, so the first symptom would appear in a designer's file rather than in a test.

## What would change the answer

- Figma announcing a deprecation date for legacy whole-document access.
- A decision to submit to the Figma Community.
- A file large enough that loading every page at start becomes a measurable cost.

Any of those turns this from a recorded status into a scheduled migration.
Until one of them happens, adding `loadAllPagesAsync()` to a module is neither required nor forbidden.

## Consequences

- A new module may write for either model. Where it reaches page contents, awaiting `loadAllPagesAsync()` first is cheap under legacy access and makes the module portable, so prefer it. This is a preference, not a rule, and code that does not do it is not a defect today.
- Existing explicit page loading stays. It is harmless under legacy access, and it is not evidence of a target.
- The five modules named above are the migration's real cost, and that cost is deliberately deferred rather than paid in pieces.
- This ADR is the only place the position is recorded, so a reader who wonders why the newer code loads pages and the older code does not has one answer to find.
