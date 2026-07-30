# Product Requirements Document (PRD)

## Automated Design System Component QA Plugin

This document outlines the functional and structural requirements for an automated Quality Assurance (QA) plugin/tool designed to validate design components within a Design System library. The requirements are derived directly from the standard **DS Component QA Checklist** and the specific implementation heuristics discussed between Engineering (Dima) and Design (Shani).

> **Provenance.** That discussion is transcribed and annotated in [`qa-source-interview.md`](qa-source-interview.md).
> This PRD was written from it, and in several places states the requirement more firmly or more broadly than design actually asked for.
> **Where the two disagree, the source document wins.**
> Items with a known gap carry a `**Source:**` note below.
> The full list is in that document's [*Where the PRD over-reads the source*](qa-source-interview.md#where-the-prd-over-reads-the-source) table, along with cross-cutting requirements this PRD never captured (descriptive per-item output, per-project item suppression, stage-2 visual evidence, the hand-QA'd reference component).

---

## Technical Architecture & Core Logic

The tool will operate as a programmatic validator (e.g., a Figma plugin or CLI parser) that scans component sets, variants, layers, tokens, and prototyping properties.

While a **Human-in-the-Loop** model will always exist for nuanced creative choices, this tool serves to shorten the QA cycle by automatically catching structural, naming, tokens, and layout compliance bugs before components are pushed to production.

---

## Detailed Requirements per Checklist Item

### 1. Storybook Alignment + Note

* **Intent:** Ensure design system components correspond directly to their coded equivalents in Storybook, while tracking intentional deviations.
* **Automated Plugin Action:**
* Scan the component canvas for an explicit **Explanation Box / "Changes from SB" note component**.
* If the component perfectly mirrors Storybook, the plugin passes it. If structural differences exist, the plugin checks for the presence of the note component detailing why changes were made (e.g., absolute hex colors replaced with opacities, removed properties).
* *Output:* Flag a warning if structural variations are detected without an accompanying documentation note on the frame.

> **Source:** the paragraph above overstates the ask on both counts.
> Comparing against Storybook is explicitly *not* this item's check - *"that's not something we check at this point"*, *"not something I expect the plugin to do, just to see that such a note exists"* - and Storybook comparison is out of phase 1 entirely.
> The check is therefore **unconditional presence of the deviation note**, not presence-when-variation-detected.
> The note is also **not a named component** (*"no, it's just [an element]"*); the shared explanation box is a plausible guess that was flagged as uncertain, so how the note is identified is the open question for this item.
> Roughly half of projects have no Storybook at all, so this row needs to be switchable off per project.
> See [source notes, item 1](qa-source-interview.md#1-storybook-alignment--note).



### 2. Components Naming Dev Alignment

* **Intent:** Align design layer component naming conventions with production codebase structures.
* **Automated Plugin Action:**
* Validate that the top-level Component Set name follows strict developer casing standards (e.g., **PascalCase** like `Button` or `NotificationTag`).
* Flag any generic, lowercase, or space-separated component master names.

> **Source:** `Button` with a capital B was cited as an *example of matching dev*, not as a request for a PascalCase rule.
> Casing is a proxy that happens to be checkable without dev input, which is what shipped as `set-name-casing`.
> The PRD also drops **half the item**: every **prop name** must match dev too, since `Start Icon` could equally be `Left Icon` and dev has already chosen.
> That half needs the same Storybook/dev source as item 1 and inherits its phase-1 exclusion.
> See [source notes, item 2](qa-source-interview.md#2-components-naming-dev-alignment).



### 3. Check All the Props (Broken Layouts & Overrides)

* **Intent:** Stress-test every permutation of a component's variants to ensure auto-layout rules, text fields, and icons don't break dynamically.
* **Automated Plugin Action:**
* **Text Stress Test:** Programmatically inject a long text string into text layers to verify that auto-layout wraps, hugs, or truncates appropriately without clipping or overlapping bounds.
* **Property Override Check:** Verify asset inheritance. For instance, when an icon variant is toggled inside a button, the plugin validates that the icon's color property correctly inherits the button's text token color rather than breaking or displaying an unlinked raw state.

> **Source:** the icon/text colour rule is not an example.
> It is a **standing DS invariant**, and it is the live failure this item was demonstrated on, which makes it the obvious first target.
> Design's words: *"the icon's colour is always the text colour. It's always like that. It's an exception if it's not"*.
> Design volunteered that the plugin can't infer it, so it belongs in **configuration**.
> Long text is the other named must-check.
> Unspecified and blocking: what "breaks" means (clipping? overflow? zero size?), and the combinatorial cost of *"all combinations"* on a large set.
> See [source notes, item 3](qa-source-interview.md#3-check-all-the-props).

> **Shipped as check `variant-property-bindings`: property *wiring*, not appearance.**
> Neither the PRD nor the source names the failure this item most often hides, because it is a Figma modelling artifact rather than a design mistake.
> A boolean property's **definition** lives on the component set, so its toggle appears in the panel for every variant the moment it is created, while its **binding** lives on one layer inside one variant and does not propagate when variants are added or duplicated.
> The result is a toggle that is present, looks identical to a working one, and does nothing - with no error and no visual difference, in a state that is hidden by default because booleans default to off.
> Twelve variants and two booleans is twenty-four bindings, which nobody verifies by hand.
>
> That is fully structural, so the check is a pure snapshot check across **every** variant: no clone, no resize, no render.
> It reports partial wiring, a property bound nowhere at all, and a binding whose target layer disagrees with the rest of the set - the shape a crossed binding takes, and the case a "did toggling change anything" test passes.
> Two of those three use the set as its own oracle rather than any naming heuristic: the layer to bind is identified by name from the variants that *are* wired, and an odd target is one the majority contradicts.
>
> The rest of the item - cycling combinations, long text, and the icon/text colour invariant - stays a tick on the row via an unconditional `manualRemainder`.
> Correct wiring says nothing about whether the states it exposes render correctly.

> **Amended 2026-07-30 (issue #112), after re-judging what the wiring check left.**
> #112 offered three products and said to re-judge them once wiring shipped.
> It has, and that changes the answer.
> Option A - the plugin pixel-diffing renders against each other - is now largely redundant: dead properties are exactly what it would find, and the wiring check finds them better, by naming the layer.
> Option B - an agent looking at 48 renders and writing prose - is the expensive, non-deterministic one, the only one that can mislead a designer with a confidently wrong subjective finding, and still blocked on the image bridge.
> Two things survived, and neither is a new check id.
>
> **The text stress test is shipped**, through row 7's resize harness rather than here: every TEXT property is set to a long string at once, and the same geometry rules judge the result.
> One measurement pass instead of one per property, and the harsher test, since real content is long in more than one slot at a time.
> Clipping and overflow under long text are `fail`.
> The harness measures the default variant only, so item 3's *"all combinations, long text always"* is narrower here than the ask and the row's remainder still says so.
>
> **The contact sheet is shipped as canvas evidence, with no verdict at all.**
> `tidy_qa_build_checklist --sheet` (`includeContactSheet: true`) draws one row per variant and one column per boolean combination, capped at 48 instances with the cap stated on the block, and returns it as `contactSheetId`.
> It removes the genuinely worst part of manual QA on this row: clicking through every combination in the properties panel one at a time, trying to remember what Ghost/Hover looked like eleven clicks ago.
> It also makes side-by-side comparison possible for the first time, which is when a human spots an inverted pressed state instantly *and correctly*, because they know the design intent.
> Row 3's status still comes from the wiring check alone.
> That the sheet claims nothing is exactly what makes it safe to draw.
> The combinatorial ceiling is answered by capping and **saying so** rather than by sampling silently: a sheet that looks complete but is not would be worse than no sheet.



### 4. Prop Names Aligned to Consolidated Catalogue

* **Intent:** Maintain a unified, predictable structural sequence for variant properties across all components in the library.
* **Automated Plugin Action:**
* Audit the sequence and naming of properties inside the component configuration.
* Ensure strict alignment with the global catalog order (e.g., `Size` must always appear first, followed by `Variant`, then `State`, then optional boolean switches like `Has Icon`).

> **Source:** the order is **not global**.
> It is consistent *within a project*, and *"in each project they can decide on a slightly different order"*, so it has to be configurable.
> Design works the same way everywhere in practice, so the shipped default is fine; a client insisting otherwise is the case to support.
> This item is also *"not part of every QA"* - it was added for one project - which is another argument for the per-project suppression checkboxes.
> See [source notes, item 4](qa-source-interview.md#4-prop-names-aligned-to-consolidated-catalogue).



### 5. Tokens (Styles & Variables)

* **Intent:** Absolute enforcement of the design system token architecture. Zero raw, unlinked values are permitted.
* **Automated Plugin Action:**
* Scan every layer property within the component set.
* **Fills & Strokes:** Must be bound to a Color Variable/Style token. Absolute hex values are rejected.
* **Typography:** All text layers must use a predefined Typography Style token.
* **Effects:** Drop shadows or blurs must be linked to Global Effect Styles.
* **Layout Spacing:** Auto-layout padding and gap properties must be bound to Spacing Variables.



### 6. Typography Desktop | Mobile Correlation

* **Intent:** Verify structural symmetry between desktop and mobile viewport adaptations of a component.
* **Automated Plugin Action:**
* Locate matched pairs of desktop and mobile component sets on the canvas.
* Verify that if a desktop component layer implements a certain typographic hierarchy (e.g., `Paragraph 2 Regular`), its corresponding mobile version automatically maps to the corresponding mobile typographic style (e.g., `Mobile/Paragraph 2 Regular`).

> **Source:** the `Mobile/...` naming convention is **invented**; nothing in the call names one.
> What was actually established: mobile is **always a separate component**, on the **same page**, so this check must *"review two components"* rather than one; and design was unsure the rule generalises at all (*"I just don't know if it's cross-cutting"*), while agreeing it definitely does on the dev side, where there is only one component.
> Both unknowns are blocking: the **pairing rule** (which mobile set corresponds to which desktop set) and the **correspondence rule** (which mobile style answers a given desktop style) would each have to be configured or hand-seeded.
> Framing worth keeping: the invariant is really **hierarchy**, and typography is just where it shows.
> The failure it prevents is picking a level because of how it looks in one viewport rather than what it means.
> See [source notes, item 6](qa-source-interview.md#6-typography-desktop--mobile-correlation).



### 7. Responsiveness (+ Min-Max Bounds)

* **Intent:** Guarantee components resize fluidly across varying screen dimensions without collapsing or stretching infinitely.
* **Automated Plugin Action:**
* Simulate horizontal and vertical scaling on instances of the component.
* Audit layout settings to ensure explicit `min-width`, `max-width`, `min-height`, or `max-height` constraints are populated where structurally required.
* *Output:* Log a warning if a component collapses to 0px or lacks basic boundary parameters (e.g., *"Results: no min value found"*).

> Shipped as check `responsive-bounds`: the **size-bounds half only**, and as advice rather than a defect.
> Reports a component whose variant roots carry **none** of `minWidth`/`maxWidth`/`minHeight`/`maxHeight`, at `low` severity with status `warn`, since the requested output was literally *"note, there aren't any"*.
>
> Incompleteness is deliberately **not** reported.
> Requiring all four bounds would put a finding on nearly every component, and a row that is always amber stops being read, which is the same reasoning behind #16's skip tally.
> A component that sets any bound has been considered, so it passes, with the unset bounds named in `note` so the row stays descriptive without going red.
>
> One finding for the whole set with a `count`, not one per variant: variants share their bound configuration, so per-variant findings would repeat a single fact up to 64 times.
>
> Whether a root can hold bounds at all is decided by the **collector**, not by the root's own `layoutMode`.
> Figma allows bounds on auto-layout frames *and their direct children*, so a `layoutMode: "NONE"` variant inside an auto-layout component set is a legitimate place for them; the collector records `boundsApplicable` because only it can see the parent.
> A set where no root can carry bounds reports `not_applicable`.
>
> Amended 2026-07-30: the tick boxes were removed from the rendered checklist - nothing ever ticked them - so the remainder line beneath the chip is what now carries the outstanding work.
>
> **Resize is now simulated and measured** (issue #111).
> `resize-probe.ts` instances the default variant into a temporary off-canvas frame, drives its width narrower and wider, lengthens every text property, records `absoluteBoundingBox` and `absoluteRenderBounds`, and removes everything in a `finally` - the same ADR-0001 carve-out as the theme probe.
> Everything decided from those boxes is pure and fixture-tested under `src/plugins/qa/resize/`.
>
> *Breaks* is defined, and it is **not** "spacing did not scale proportionally".
> In auto-layout spacing deliberately does not scale, so widening a FILL button correctly leaves padding and gap alone and only re-positions the content block.
> A proportional rule would fail every correctly built component in the file.
> The intended meaning is **nothing drifted**.
>
> Findings split two ways, and the split is what makes the row trustworthy:
>
> * **Verdicts** - content collapsed to nothing, overflowing a clipping frame, text whose glyphs a clipping ancestor actually hides, or growth past a `maxWidth` the component itself declares.
>   Wrong however they arose, so these `fail` the row at `high` severity.
>   This is the first thing on row 7 that can go red.
> * **Candidates** - a newly overlapping pair, a gap that grew, a root that got taller as it was widened, text spilling out with nothing clipping it, and a shadow or stroke cropped by a clipping ancestor.
>   `SPACE_BETWEEN` on a stretching container is exactly correct for a select, a dropdown, a list row or a nav item, and an avatar stack overlaps by design, so these are *measured and stated* - "the gap went from 8px to 288px" - at `low` severity, and only `warn`.
>   Ruling on them needs design intent, which the engine does not have.
>
> A **structural pre-scan** reads `primaryAxisAlignItems: "SPACE_BETWEEN"` plus a non-HUG horizontal sizing off *every* variant, recovering most of the coverage the probe's one-variant scope gives up.
> Unmeasured suspicions go in the remainder, never on the chip.
>
> Two things the probe refuses to guess.
> A hugging component has no resize behaviour to test - Figma recomputes it back to its content width - and is skipped with that reason printed.
> And when a driven width does not move the component at all, "Figma is holding it at a fixed size" and "the probe could not drive it" are indistinguishable from inside the plugin, so `unmoved` makes the row report the resize half as **not established** rather than as a pass.
> That is also the self-check for the one load-bearing assumption in the design - that layout recomputation after `resize()` is synchronous, so post-resize bounds are readable in the same tick - which means a broken assumption surfaces as a stated limitation instead of a wrong green.
>
> The remainder shrinks accordingly rather than disappearing.
> Once geometry has been measured, what genuinely remains is what geometry cannot see: an image or gradient fill that distorts when stretched, a corner radius or border that reads wrong at width, padding drifting on a frame without auto-layout, and the variants the probe did not instance.
>
> Two judgements in the geometry are worth stating, because both are narrower than the PRD's own wording.
> *Cut off* requires a clipping ancestor: ink leaving its own box with nothing clipping it is reported as text spilling over its neighbours, a candidate, because the text is still visible and calling it cut off would be a confident claim about something that did not happen.
> And *height changed* is asked only of growth while widening.
> A component getting shorter as it widens is a wrapping label unwrapping, and one getting taller as it narrows is the same label wrapping the other way; both are correct, and both happen on nearly every component with text in it, so reporting them would bury the signal the rule exists for.
>
> **Evidence goes on the canvas, only when something broke.**
> `tidy_qa_build_checklist` draws the baseline beside the state that broke, labelled with the measured numbers, and returns it as `resizeEvidenceId`.
> This answers design's stage-2 ask literally - *"then let it show me what the problem is"* - in the medium she already works in.
> The picture is **proof, not analysis**: geometry has already written the finding, so nothing reasons over the pixels and no image goes to an agent.
> A healthy component draws no block at all, so a clean run costs exactly what it did before.
> The row's status text still stands alone, because the default read-only run produces no canvas and therefore no evidence.



### 8. Icons / Illustrations / Logos Connected to Foundations

> Shipped as check `asset-provenance` (issue #101) — **negative detection
> only**. The plugin API exposes no library attribution for components
> (`libraryName` exists only for variable collections; an instance gives you
> its main component's `key` and `remote` flag, never a file key or library
> name), so "originating directly from the approved Foundations Library" is not
> answerable in-plugin. The check therefore **fails** only what is *certainly*
> not a library instance — raw path geometry alongside other content — and
> **warns** on a nested instance whose main component is local: a component
> legitimately built from private sub-components in its own file (Kido's
> `_elements / …` parts) looks identical here to a stray local copy of an icon,
> so the row asks the designer to decide rather than asserting a defect and
> telling her to publish a deliberately private part. Remote nested instances
> pass, with the unverifiable-origin caveat in the result's `note` rather than
> implying a guarantee it can't make. A component that *is* the asset (every leaf
> in the variant trees is geometry) reports `not_applicable`.
>
> **Positive detection added by #122.** A publish key is stable and globally
> unique, so a generated list of the keys Foundations publishes turns the
> unanswerable question into a lookup. `scripts/generate-asset-manifest.mjs`
> calls the REST API out-of-band (the plugin sandbox has no network, and no
> plugin API enumerates a library's components) and writes
> `src/plugins/qa/asset-manifest.json`, which esbuild inlines into the bundle.
> With a manifest present a remote instance is looked up by its main component's
> key: found on a current page it is genuinely **verified** and the caveat is
> dropped, found on a deprecated page it **fails** (the legacy-directory
> rejection design asked for), and absent from the manifest it **warns** while
> naming the manifest's generation date. Absent is deliberately not a failure:
> an asset published after the manifest was taken is legitimately missing, and
> failing it would break QA for every newly published icon until someone
> regenerated. The manifest is committed so the approved set is reviewable in a
> diff and reproducible from a released build, rather than living per-machine in
> `clientStorage` where two designers could disagree about what "approved"
> means; it records facts only (key, name, page, owning set), while the rule for
> what counts as a deprecated page stays in `asset-manifest.ts` so regenerating
> cannot quietly change a verdict. An ungenerated manifest is a supported state
> and falls back to the pre-#122 behaviour above.
>
> **Configurability**, which design asked for unprompted, lands as the
> deprecated-page rule rather than an allowed-folder list: naming the folders
> assets must come *from* would need updating whenever Foundations reorganises,
> whereas naming the ones they must not come from matches how she described the
> problem ("I want to make sure it isn't connected to legacy").
>
> Refresh runbook: [`docs/asset-manifest.md`](asset-manifest.md).

* **Intent:** Ensure all iconography utilized inside components stems from the single source of truth library.
* **Automated Plugin Action:**
* Inspect nested icon sub-components.
* Verify they are legitimate library instances originating directly from the approved **Foundations Library**.
* Flag copy-pasted raw vectors, unlinked SVG paths, or instances pointing to deprecated/legacy icon directories.

> **Source:** design added one requirement unprompted.
> **Which folder** assets must come from has to be **configurable**, because foundations folders go legacy and *"I want to make sure it isn't connected to legacy."*
> She also put the raw-SVG case in perspective: it happens, but it's an anomaly (*"mostly it will be from the library"*), which is consistent with the shipped check being negative-detection-only.
> See [source notes, item 8](qa-source-interview.md#8-icons--illustrations--logos-to-foundations).



### 9. Layer Naming + Structure

* **Intent:** Keep the internal layer tree clean, semantic, and highly optimized for engineering translation.
* **Automated Plugin Action:**
* **Name Cleanliness:** Reject default Figma layer names (e.g., `Frame 1204`, `Group 2`, `Vector 4`). Text layers must be named cleanly (e.g., `label`, `title`).
* **Structural Redundancy:** Identify and flag empty or useless structural wrappers (e.g., a frame nested directly inside an identical auto-layout frame with no distinct padding, background, or layout adjustments).



### 10. 4px Grid Alignment

* **Intent:** Ensure spatial configurations strictly respect the layout grid.
* **Automated Plugin Action:**
* Check all spatial dimensions: width, height, padding, item gaps, margins, and corner radiuses.
* All absolute numerical values must be multiples of **4px** (with **2px** flags permitted strictly for micro-elements like borders or tight inline tags).
* *Exception Logic:* Top-level container width/height bounds are exempt from absolute 4px matching *only* if their parameters are natively governed by "Hug contents" or "Fill container" constraints.

> **Source:** the hug exemption is confirmed, and confirmed as being about the component's **own size** (text can be a little longer).
> Two corrections.
> 2px carries **no micro-element restriction** - *"spacing is always the 4 pixel grid, it can be 2. 2 is also fine, but apart from that it's always 4"*.
> And **icon sizes** are missing from the PRD altogether: 16/24/32/48, plus 12, plus **14 sometimes**, which design suggested entering as a configured exception.
> Everything here is advisory - *"it'll be a note with a recommendation, so if you think it's fine, it's fine."*
> See [source notes, item 10](qa-source-interview.md#10-4px-grid-alignment).



### 11. Interaction (Hover Only)

* **Intent:** Prevent local interactive prototyping states inside the component library from conflicting with real-world application user journeys.
* **Automated Plugin Action:**
* Scan the Prototype transition properties mapped between variant frames.
* Validate that any micro-interaction is strictly declared as a **While Hovering** state.
* Flag and block any application-level interaction triggers such as `On Click` or `On Press`.



### 12. Description (Also Known As + Misprint Keywords)

* **Intent:** Guarantee searchable metadata and usage context are embedded directly inside the asset configuration window.
* **Automated Plugin Action:**
* Read the Figma Component Description field.
* Ensure it is populated and conforms to standard templates. It must include an **"Also known as:"** alias line (to aid designer search discovery) and documentation lookup keywords or links.

> **Source:** the third element is specifically a **link to Storybook**; design corrected herself mid-sentence from "documentation" to "Storybook".
> Since there usually is one and it's usually wanted, *"that can be the plugin's default."*
> This is also the item she named as varying most from client to client, which is what prompted the hand-QA'd reference component idea.
> Note the shipped `description` check does **not** verify the Storybook link, so this row is partially automated.
> See [source notes, item 12](qa-source-interview.md#12-description-aka--misprint).



### 13. No Conflicts

* **Intent:** Block compilation errors before pushing updates to library consumers.
* **Automated Plugin Action:**
* Analyze the properties matrix of the entire component set.
* Flag any duplicate variant definitions (e.g., accidentally configuring two distinct layout frames with the exact same properties such as `Size=Medium, Variant=Primary, State=Default`).

> **Source:** "block compilation errors" oversells it.
> Design's own verdict is *"this is pretty redundant"*, because Figma already surfaces conflicts natively in a component set.
> It shipped on the grounds that automating it is free, not that it is valuable; worth knowing before defending the row.
> See [source notes, item 13](qa-source-interview.md#13-no-conflicts).



### 14. Easy to Use (Nested Component Management)

> Shipped as check `nesting-depth`, surfaced on the checklist as **"Nested
> Instance Depth"** — "Easy to Use" named the goal rather than the thing being
> measured, and read as meaningless on the generated artifact.

* **Intent:** Prevent complex components from overwhelming end-users via messy configuration panels.
* **Automated Plugin Action:**
* Evaluate the overall depth of the internal component layer architecture.
* Count the total levels of nested component properties exposed to the parent panel. If property nesting depth exceeds a standard threshold (e.g., more than 2 deep), trigger an optimization suggestion to flatten or simplify the configuration.

> **Source:** the threshold and the "recommend, don't fail" framing are design's own words (*"if there are more than two, maybe it recommends: note, this component is a bit too long, maybe consider reducing"*).
> But she was counting **nested components** - the demo dropdown *"has two"* - not levels of property depth.
> The motivation is symmetric: deep nesting hurts dev and design alike.
> See [source notes, item 14](qa-source-interview.md#14-easy-to-use-nested-components).



### 15. Preferred (Instance Swapping)

* **Intent:** Restrict instance swapping fields to logical selections.
* **Automated Plugin Action:**
* For any exposed component instance swap property (such as an icon slot), check that **Preferred Values** are explicitly assigned.
* For instance, a status tag component must limit its swappable icon property list to context-appropriate icons (e.g., checkmarks, error symbols, alerts) rather than exposing the entire global icon catalog.

> **Source:** "must" is too strong.
> This item is **optional and usually absent** - *"mostly it won't be there"*, *"it's not critical"* - and relevant mainly on components like status.
> Design was unsure it was worth automating at all.
> A failing row here should read as a suggestion, and an empty one as normal.
> See [source notes, item 15](qa-source-interview.md#15-preferred-instance-swapping).



### 16. High Contrast (Accessibility / A11y)

> Shipped as check `high-contrast` (issue #103), computing WCAG AA per text layer **per theme mode** on top of #17's resolution tables.
>
> **The background is never guessed.** It is the nearest ancestor with a visible solid fill, composited outward until the stack is opaque; if nothing opaque is reached, the layer is *not evaluated* rather than measured against an assumed white.
> Sibling geometry is out of scope, so a chip over a hero image degrades to "not evaluated" instead of to a wrong answer - deciding what sits behind a layer would need absolute bounds and a z-order model.
> On a checklist a human still ticks through, a false negative is cheap and a false positive is expensive: failing a component against an invented background is what makes designers stop reading the row.
>
> Every skipped layer lands in one low-severity tally finding, and any skip makes the row `warn` rather than `pass`, so "not evaluated" can never read as green.
> Alpha is composited rather than skipped (both paint opacity and node opacity), because the Kido DS deliberately uses opacity in place of absolute hex; only a chain that never reaches opacity is skipped.
>
> Colours resolve through literal hex, bound variable, paint style, and a paint style whose paint is variable-bound - the `tokens` check accepts either a variable or a style, so resolving variables alone would leave most rows unevaluated for an implementation-detail reason.
> Granularity is the layer, not the character range: mixed fills are not evaluated, and a mixed font size is judged at its smallest.
> Thresholds are AA's dual pair, 4.5:1 and 3:1 for large text (>= 24px, or >= 18.66px bold), with no warn tier - AA is the standard and a warn band for AAA is noise.
> Invisible text needs no special case: it arrives as the ratio-1.0 extreme, which is why #17 leaves it here.
>
> Findings are one per colour pair x mode with an occurrence count, naming tokens over hex.
> Distinct pairs are never merged, since a hover surface and a default surface fail for different reasons.
>
> **Disabled variants are not evaluated.** WCAG 1.4.3 exempts "inactive user interface components", so a faded disabled state is not a defect.
> The first real set this ran against produced three of its four failures from disabled states - all correct, all unfixable, and enough to teach a designer to skip the row.
> Inactive is recognised from a `Disabled` variant property (a value of `Disabled` on any property, or a `Disabled` boolean that is on), and the row's caveat says so, since a set naming it differently would still be measured.
>
> A `not_applicable` result always carries a note explaining what it found nothing of - usually a component assembled entirely from nested instances, whose text belongs to those components.
> Without it the row renders blank, which reads as a broken check rather than an inapplicable one.

* **Intent:** Maintain product accessibility standards automatically.
* **Automated Plugin Action:**
* Detect the background color token directly behind text layers inside the component variant frames.
* Calculate the relative color contrast ratio between the text token and its immediate background layer to ensure compliance with WCAG AA guidelines.

> **Source:** design's entire ask was *"just see that everything is readable."*
> No standard, threshold, or methodology came from design.
> WCAG AA, the dual thresholds, the background-compositing rules and the disabled-state exemption are all engineering decisions, which is why they carry their own rationale above.
> Useful to know when a row is challenged: the *approach* is ours to revise, not a design requirement.
> See [source notes, item 16](qa-source-interview.md#16-high-contrast-a11y).



### 17. Themes (Core / DNA / OldNews)

> Shipped as check `themes` (issue #102), covering **resolution integrity only**.
> It reports a bound variable with **no value for some theme mode** (the missing override on an extended collection) and an **alias chain that cannot be resolved** in some mode.
> Invisible text is deliberately *not* reported here: it is contrast 1.0, so #16 owns it, and reporting it twice would describe one defect in two rows.
> Raw unbound values stay with the `tokens` check.
>
> Nothing switches modes on the page or the component.
> Per-mode values come from a **resolution probe**: one temporary off-canvas frame with explicit modes pinned on it, each used variable resolved against it once per mode, removed in a `finally`.
> Figma does the resolving, so the values are faithful rather than a reimplementation of mode inheritance, and cost scales with variables used rather than variants x modes x nodes.
> This is a documented carve-out from ADR-0001's read-only Query definition.
>
> The theme collection is **not configured by name**: it is the bound collection with the most modes (the shared helper the generated doc pages use), and the result states which collection and modes it evaluated so a wrong pick is visible instead of silently green.
> Where nodes pin their own explicit modes the probe cannot speak for them, and the check `warn`s rather than reporting a confidently wrong value.
> Flagging colours bound to a *single-mode* collection as "not theme-aware" is a candidate follow-up, not v1 work: a false-positive factory until narrowed much harder.
>
> **The visual half is a human tick, not an omission.**
> The source ask was that for every mode the component has, it works and *looks good* in all of them, which resolution integrity does not establish: a set can resolve perfectly in both modes and still read wrong in one.
> Every reported outcome therefore carries a `manualRemainder` naming the modes to review, so the row shows a status chip with the remainder spelled out beneath it, and counts toward `counts.partial`.
> Amended 2026-07-30: this said "and a tickbox" before the boxes were removed from the rendering.
> Without it a green chip stood for the visual review on every run.
>
> That remainder is **conditional**, on item 19's logic rather than item 7's.
> `not_applicable` here means no theme collection, a single-mode collection, or nothing this set binds being theme-aware, and in all three the component renders identically in every mode, so there is nothing to compare by eye.

* **Intent:** Validate that variables map cleanly across dynamic display scenarios without visual bugs.
* **Automated Plugin Action:**
* Programmatically switch the parent page or component frame through all designated Design System theme collection modes (`Core`, `DNA`, `OldNews`).
* Scan for unlinked references, invisible text (foreground matching background color due to bad theme mapping), or broken variable style fallbacks.



### 18. Page Template

* **Intent:** Enforce spatial and presentation visual hygiene on the internal Design System delivery canvas.
* **Automated Plugin Action:**
* Verify the presentation canvas respects the official internal delivery template layout. Ensure structural headers, anatomy breakdowns, usage specs, and component frames are neatly sorted into their assigned regions.

> **Source:** far lighter than this.
> In full: the component page exists, there are **labels around the component**, and the page *"is arranged well."*
> Headers, anatomy breakdowns, usage specs and assigned regions are all invented.
> What "arranged well" means was never pinned down, so the tractable reading is **"are the expected labels present"**, which likely reduces to checking the `component-labels` module's output rather than matching a template.
> Blocked on more than a definition, though: `ComponentSetSnapshot` stops at the component set and these labels are page siblings, so this is the first check that needs the collector's scope widened.
> See [source notes, item 18](qa-source-interview.md#18-page-template).



### 19. Documentation

* **Intent:** Confirm that no component ships to production without its corresponding implementation manual.
* **Automated Plugin Action:**
* Check for the presence of a dedicated text or linked reference block containing usage guidelines, code behavior expectations, and engineering specs. Components lacking a minimum threshold of instructional content will trigger a documentation warning flag.

> Shipped as check `documentation`, and **deliberately unable to fail.**
> Design's framing is that QA routinely runs *before* documentation exists, so an undocumented component is the normal mid-process state rather than a defect: a link present is `pass`, none is `not_applicable`.
> Reporting absence as `warn` would make most runs amber for a non-problem.
>
> The signal is **Figma's own documentation-link field**, the only machine-readable "this is documented" marker the plugin API exposes.
> Design described item 19 as a *stage*, not a field, so if their documentation lives elsewhere (a linked page; a Storybook URL in the description, which is #12's business) this check is looking in the wrong place.
> Hence the `note` on both outcomes, so an empty row reads as "nothing found here" rather than as green.
> **Worth confirming with design before treating the row as authoritative.**
>
> The row's blurb claims usage guidance, examples and properties are documented, which a link cannot establish, so a `pass` also emits a `manualRemainder` asking for the content review.
> Amended 2026-07-30: this said "keeps the row's tickbox" before the boxes were removed from the rendering.
> Only on `pass`: with no documentation there is nothing to read, and asking for a review there would contradict treating absence as normal.
>
> **Source:** the "nothing ships without its manual" framing inverts the reality - *"many times we do QA before documentation, because it's often only a later stage."*
> It is a yes/no item, with no "minimum threshold of instructional content" behind it.
> See [source notes, item 19](qa-source-interview.md#19-documentation).


Framelist design:
https://www.figma.com/design/CdytzPWDTc7npImeQG0Pnc/%F0%9F%91%BA-Dima-s-other-tests?node-id=2950-606&t=jpvLZa9PFBh039Mk-11
