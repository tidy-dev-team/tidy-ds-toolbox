# QA checklist - source interview notes

Primary-source record of the walkthrough call in which Shani Gurevich (design) took Dima (engineering) through the **DS Component QA Checklist** item by item, 2026-07-16.
[`prd-automated-qa.md`](prd-automated-qa.md) was written _from_ this call; where the two disagree, **this document wins** and the PRD is wrong.

Its purpose is to keep the design intent grounded when the checks get built and argued over.
Several PRD items read as firmer, broader, or more machine-checkable than what was actually asked for.
Those gaps are called out per item and collected in [§ Where the PRD over-reads the source](#where-the-prd-over-reads-the-source).

Quotes are Shani's unless attributed to Dima, lightly trimmed for filler, with the Hebrew kept because the distinctions being drawn are often in the exact wording.

---

## Cross-cutting requirements

These came up repeatedly and belong to no single item.
None of them are in the PRD.

### The QA workflow the artifact plugs into

QA is done in a temporary section at the **end of the component's page**: one instance of the component, next to the checklist.
It is ephemeral - _"it isn't kept; the moment QA is over it can be deleted, it can go to Archive."_
Whoever runs QA goes over the list one item at a time, switching props by hand.

This matches what [`prd-qa-canvas-checklist.md`](prd-qa-canvas-checklist.md) builds.
Worth knowing that the frame is **disposable by design**: it does not need to survive, version, or reconcile with anything.

### Output shape

Shani's ask, in order of firmness:

1. A **list with the title and the result** per item - _"איזה שהוא ליסט פשוט שיש בו את ה-title ו-and the result"_.
2. The result must be **descriptive**, not just a tick.
   In her words: _"descriptive שמסביר מה הוא מצא. מצא ש-note exist"_
   Glossed: "descriptive, that explains what it found. Found that a note exists."
3. Rendering it as the sticky-note artifact they already use is _convenient_ but not required, because they're used to it: _"לי זה נוח"_, "it's convenient for me".
   And explicitly: _"זה לא חייב להיות פתק כזה."_
4. A single big flag at the end is acceptable as well as, not instead of, the per-item results.

Dima's argument for why descriptive matters, which she accepted: on an item like layer naming, a bare "no" leaves you re-checking everything yourself.

### Stage 2: show the problem, don't just name it

_"עוד רעיון מבחינת ה-output... נגיד יש לו בעיה עם ה-responsiveness - אז שיראה לי מה הבעיה."_
For some findings the plugin should **show** the failing state, not describe it.
Explicitly framed as a second phase: find all the problems first, present them nicely after.

Responsiveness was her example, which is a hint about what item 7's output wants to be.

### Per-project item suppression

Roughly **half of projects have no Storybook at all** (built from scratch), and then item 1 and the Storybook half of item 2 are simply skipped: _"אפשר להגיד במחצית מהפרויקטים הם ככה, ואז בכלל אין עניין בדבר הזה."_
Less robust design systems also skip the min/max part of item 7.

Agreed conclusion: the plugin's settings should be **the checklist with checkboxes**, for turning off what doesn't apply to this project.

### Human in the loop, always

_"יכול להיות שאנחנו מגדירים שפה צריך human in the loop, וזה לא יכנס"_ - some items should be declared as human-only rather than half-automated.
Dima: human in the loop exists regardless; halving the cycle time is already the win.

Also agreed: this lands over **2-4 iterations** - build, run it, find what it misses, fix, repeat.

### A hand-QA'd reference component

Dima's proposal, twice, and not contested: QA **one component manually** and hand it to the plugin as the worked example, for everything that can't be inferred - prop order, what a description should contain.
Shani's counter was narrower, not opposed: prop order specifically could just be a setting, since she works the same way across projects.

### Storybook access is a real obstacle

_"אף פעם לא היה לי גישה ל-Storybook שלא הייתה דרך private browser או דרך localhost"_ - she has **never** had Storybook access that wasn't localhost or a private browser, and localhost has to be started from the terminal each time.
Dima noted an agent can run that itself, given approval.
Shani: _"אם אפשר לעשות את זה, זה נראה לי מאוד value-pack"_ - because Storybook to Figma round-tripping is the single most repetitive part of QA: _"Storybook והלוך חזרה, Storybook והלוך חזרה."_

---

## Per-item notes

### 1. Storybook Alignment + Note

The project ran **backwards**; components were matched _to_ Storybook: _"לקחת מה-Storybook וללכת לפי הדיזיין שיש שם."_
Match means **visually and in props**, and _"בדיוק אותם ה-props-ים"_ - exactly the same prop names.

**But that comparison is explicitly not this item's check.**
Twice:

> _"זה לא משהו שנבדוק בנקודה הזאת."_ - "that's not something we check at this point."
>
> _"זה לא משהו שאני מצפה שהפלאגין יעשה, פשוט לראות שיש note כזה."_ - "that's not something I expect the plugin to do - just to see that such a note exists."

The item's actual content is **the note**.
She always adds a note listing what was changed relative to Storybook, because she wants the dev side to update accordingly: _"אם ביצעת איזה שהם שינויים מה-Storybook, אז אני מציינת את זה. כי אני ארצה גם שצד הפיתוח עדכן את זה."_
The residual manual check is only that nothing present in Storybook was plain missed.

The note has **no name and is not a special component** - _"לא, זה סתם"_ - "no, it's just [an element]."
Dima guessed it's always the shared explanation-box component since they reuse components; Shani agreed _("נכון")_ but immediately flagged that they need to sort out what the plugin can and can't do here, because it _isn't_ certain.

Storybook comparison is out of the first phase outright: _"השוואה ל-Storybook זה יכול לגמרי לא להיות ב-phase 1."_

**Implications for the check.**
The automatable core is small and well-defined: _does a note exist on the page/frame?_
Everything about detecting deviations from Storybook is out of scope for now.
The open question is what identifies the note - a specific component key would make this trivial and is probably true in practice, but was not confirmed.

### 2. Components Naming Dev Alignment

Two halves, and the PRD only implements the first:

1. The set name matches what dev has - _"ה-naming של הקומפוננט, שקוראים לו Button עם B גדולה, זה באמת מה שגם קורה בצד הפיתוח."_
2. **Every prop name too**, because `Start Icon` could equally be called `Left Icon`, and dev has already picked one: _"וגם לעבור על כל השמות של ה-props, ולראות שזה תמיד אותם השמות"_
   Confirmed as the point of the item when Dima asked: _"שהשם ושהשמות של ה-props אותו דבר, זה נקודה ספציפית רק על זה."_

Framing: _"שים לב רגע לקטלוג של ה-naming שייצרת"_ - pay attention to the naming catalogue you produced.

**Implications.**
`Button` with a capital B was an _example of matching dev_, not a request for a PascalCase rule.
The shipped `set-name-casing` check is a proxy for half of this item that happens to be checkable without dev input.
The prop-name half needs the same Storybook/dev source as item 1 and inherits its phase-1 exclusion.

**Superseded in part.**
A naming rule _was_ stated later, on 2026-08-04: PascalCase or kebab-case, and a bare lowercase word is an error.
See [§ Second pass](#second-pass-canvas-comments-2026-08-04).
The prop-name half is untouched by that comment and stays excluded.

### 3. Check All the Props

_"זה הכי טכני בעולם"_ - the most mechanical item there is.
Cycle the props, ideally **all combinations** _("אולי הוא יכול לעבור גם על הכל, לעשות קומבינציות של הכל")_, and see nothing breaks.

Two specifics:

- **Long text, always.** _"נקודה שצריך לשים לב אליה תמיד זה באמת לנסות לשים טקסט ארוך, ולראות שהוא מגיב טוב, שהוא לא נשבר."_
- **Icon colour follows text colour.**
  She found a live failure mid-call: adding an icon produced an icon whose colour didn't match the label.
  Stated as a standing DS rule rather than a one-off, meaning always, and an exception if not: _"שצבע של האייקון תמיד צבע של ה-text. זה תמיד ככה. זה חריג אם זה לא ככה."_

She volunteered that the plugin can't know the icon rule by itself; Dima's answer was that it goes into the instructions.

**Implications.**
The icon/text colour rule is a **configured DS invariant**, and it is the concrete failure this item was demonstrated on, so it is a good first target.
"All combinations" is combinatorial on a large set, so what "breaks" means needs defining before this is buildable.

### 4. Prop Names Aligned to Consolidated Catalogue

**About order, not names**, despite the title: _"זה קשור לסדר של ה-props, שנגיד variant הוא תמיד לפני state, ו-size הוא תמיד ראשון."_

Scope is consistent within a project, but the order itself is per-project: _"בכל הקומפוננטות בפרויקט. צריך להיות אותו סדר. אבל בכל פרויקט הם יכולים להחליט על סדר קצת אחר"_
Later softened: she works the same way everywhere, so a setting only matters when a client insists.

Also: _"זה לא יהיה בכל QA"_ - it isn't part of every QA; she'd added it for this project specifically.

Dima proposed renaming it prop order / prop naming consistency; agreed.

### 5. Tokens (Styles & Variables)

_"לראות שהכל מחובר לטוקנים"_, enumerated: gap, padding, corner radius, all colours, and text bound to a **style**.
Effects too - _"אם יש אפקטים, אז גם שהם מחוברים ל-style. שלא יהיה סתם אפקט"_.

One nuance in her phrasing: _"אם זה על hug, אז זה מחובר"_ - hug and token-binding are treated as alternatives for a dimension, which is the same exemption that shows up explicitly under item 10.

### 6. Typography Desktop | Mobile Correlation

She opened by ruling it out and reversed within the same exchange:

> _"זה משהו ייחודי. זה לא משהו שאפשר להכניס..."_
>
> then: _"למעשה יכול להיות אחלה, להוסיף את זה."_

The rule: if desktop picks `paragraph 2 regular`, mobile uses the corresponding one _("אז גם במובייל...")_.
She was unsure it generalises - _"אני פשוט לא יודעת אם זה כזה רוחבי"_ - but on the dev side it definitely does, because dev has one component: _"אצל פיתוח תכלס זה כן רוחבי, כי פיתוח זה תמיד צריך להיות אותו דבר."_

Structural facts that constrain the check:

- Mobile is **always a separate component** - _"המובייל הוא תמיד הוא קומפוננטה נפרדת"_.
- It sits on the **same page** (confirmed: _"כן, באותו עמוד"_).
- So this check needs to **review two components together**: _"זה פשוט דורש אבל review, שתי קומפוננטות."_

Dima's reframe, unanswered but worth keeping: the invariant isn't really typography, it's **hierarchy** - typography is just where it's visible.
The failure mode it prevents is picking a level because of how it looks in one viewport rather than what it means.

**Implications.**
The hard part is **pairing** desktop and mobile sets and **corresponding** styles across them.
Neither was specified, and the PRD's `Mobile/Paragraph 2 Regular` naming convention is an invention (see below).
Pairing rule and style-correspondence rule are the two things to settle before building; both probably need to be configurable or hand-seeded.

### 7. Responsiveness (+ Min-Max)

Resize it and see nothing breaks.
The specific thing to look at is **min and max width and height**: if there are none, recommend having them - _"יכול להיות output של כאילו: שים לב, אין"_ - "output like: note, there aren't any."
Because it's recommended for components generally.

Explicitly soft: _"בפרויקטים שה-DS-ים הם פחות רובסטיים כמו פה, אז אנחנו לא תמיד נכנסים לזה. אבל זה יהיה נחמד. אולי."_

**Implications.**
This is an **advisory** item: "note, there's no min-width" is the desired output, not a failure.
It is also the item she picked when suggesting the plugin should _show_ the broken state visually (see cross-cutting above).

### 8. Icons / Illustrations / Logos to Foundations

Icons should come from the icons / foundations folder.
The requirement she added unprompted: **which folder** has to be configurable, because foundations folders go **legacy** - _"לפעמים יש לתיקיות foundations שהם legacy, ואני רוצה לוודא שזה לא מחובר ל-legacy."_

A pasted raw SVG does happen but is an anomaly, not the norm: _"יש מקרים שזה יהיה SVG שהוא לא קומפוננטה, אז זה חריג, שמישהו לא שים לב"_ and _"לרוב זה כן יהיה מ-library."_

This is consistent with the shipped `asset-provenance` check being negative-detection-only and deferring the approved-key manifest.

### 9. Layer Naming + Structure

Open the layers panel and look for a `Frame 208`.
Two things:

- **No redundant frames**, first and emphasised.
  Her example: if these three siblings were wrapped in a frame, that wrapper would be redundant.
  Dima's sharper version, agreed: _"wrapper שמקיף wrapper, זה בטוח מיותר."_
- **Uniform naming**: text is _usually_ called `label`.
  _"משהו שאנחנו מנסים שה-layer naming יהיה אחיד."_

Severity, in her words: _"לא סופר קריטי"_ - not super critical; just look over how it's built.

### 10. 4px Grid Alignment

Dima asked directly for the exception cases.
Answers:

- **Hug means the grid doesn't apply**, and specifically to the component's own size: _"אם הדבר הוא ב-hug, אז זה בטוח לא מעניין אותי ה-pixel grid... מבחינת האורך של הקומפוננטה"_ - because the text may be a little longer.
- **Spacing and padding are always on the grid**, with 2 allowed: _"ה-spacing זה תמיד יהיה 4 pixel grid, זה יכול להיות 2. 2 זה גם בסדר, אבל חוץ מזה זה תמיד 4."_
- **Icon sizes:** 16/24/32/48 confirmed, _plus_ 12, and _"זה יכול להיות גם 14 לפעמים"_ - 14 sometimes, which she suggested entering as a configured exception.

Dima's framing, uncontested: it's a recommendation either way - _"זה יהיה פתק עם המלצה, אז אוקיי, אם אתם חושבים שזה בסדר, אז זה בסדר."_

### 11. Interaction (Hover Only)

**Only** `while hovering`, and the reason is concrete: a `pressed` state in the library collides with the real prototype in the design file - _"ברגע שעושים ל-pressed, אז זה מתנגש עם ה-prototype האמיתי בסוף בקובץ עיצוב."_

The check is existence: _"לבוא ולראות שזה בכלל קיים."_

### 12. Description (AKA + Misprint)

_"לרוב ה-description שאנחנו עושים הוא תמיד כזה 'also known as' ו-misprint."_

Varies by client, and the variation is a **link to Storybook** - she corrected herself mid-sentence from "documentation" to "Storybook".
Since there usually is a Storybook and it's usually wanted, _"זה יכול להיות ה-default של הפלאגין."_

She flagged the description as the item that varies most from client to client, which is what prompted Dima's hand-QA'd-reference-component idea.

### 13. No Conflicts

_"זה די מיותר"_ - pretty redundant, because Figma surfaces conflicts natively in a component set.
Dima's position, which is why it shipped anyway: if it's automatable, why not.

Worth remembering when this row's value is questioned: **design already considers it redundant**, so it costs nothing and adds nothing.

### 14. Easy to Use (Nested Components)

Check there aren't too many nested components.
Demonstrated on the Agent pack dropdown, which has two.

Her proposed rule is the one that shipped: _"אם יש יותר משתיים, אז אולי הוא ימליץ לך: שים לב, קומפוננטה הזאת קצת ארוכה מדי, אולי תשקול להוריד"_ - over two, recommend reducing.
**A recommendation, in both her wording and Dima's.**

Motivation is symmetric: Dima raised the dev-side pain of deep nesting from AppsFlyer; Shani added it hurts the design side too, _"כי זה באמת משפיע על ה-easy to use."_

### 15. Preferred (Instance Swapping)

**Optional, and usually absent.**
_"זה אופציונלי... לרוב לא יהיה את זה"_ - relevant mainly on components like status, where the swappable icon should be limited to check mark, double check mark and similar.
Closing verdict: _"זה לא קריטי."_

She was unsure it was worth automating at all: _"נראה לי זה משהו שאפשר לעשות איתו משהו או לא."_

### 16. High Contrast (A11y)

The whole of what she asked for: _"פשוט לראות... שהכל קריא"_ - just see that everything is readable.
Dima named it as contrast/accessibility; she agreed.

No thresholds, standard, or methodology came from design.
Everything specific in the shipped `high-contrast` check is an engineering decision, which is why it carries its own long rationale in the PRD.

### 17. Themes (Core / DNA / OldNews)

_"כל הרעיון של לבדוק את ה-modes"_ - for every mode the component has (in this file, DNA and OldNews), see that it works and **looks good**, in all of them.

Note that the ask is visual - "looks good" - while the shipped check covers resolution integrity only.
That is a deliberate narrowing, documented in the PRD, not a misreading.

### 18. Page Template

_"זה קשור לעמוד עצמו - רגע לראות שהוא מסודר, שיש לי עמוד קומפוננטה ושיש לי label-ים סביב הקומפוננטה, לראות שזה מסודר טוב."_

So: the component page exists, labels are present around the component, the page is tidy.

**Implications.**
Notably lighter than the PRD's version.
Nothing was said about headers, anatomy breakdowns, usage specs, or assigned regions.
What "arranged well" means was never pinned down, and the labels are presumably the `component-labels` module's output, which would make the checkable part "are the expected labels present", not "does the layout match a template."

### 19. Documentation

Yes/no.
And usually **not yet applicable**: _"הרבה פעמים אנחנו נעשה QA לפני דוקומנטציה, כי זה הרבה פעמים גם שלב אחרי רק."_

**Implications.**
The common case is that documentation doesn't exist at QA time and its absence is **not a defect**.
A `not_applicable` or advisory result is the right default; a failing row here would be noise on most runs.

---

## Where the PRD over-reads the source

Each of these is in [`prd-automated-qa.md`](prd-automated-qa.md) but not in the call.
Most inflate a soft or narrow ask into a firm, broad one.

| PRD | Source |
|---|---|
| **1** - "the plugin checks for the presence of the note" _when_ "structural differences exist"; "Flag a warning if structural variations are detected without an accompanying documentation note" | Detecting structural variation vs Storybook is exactly what she scoped out, twice. The check is unconditional: does a note exist. |
| **1** - an "Explanation Box / 'Changes from SB' note component" | _"לא, זה סתם"_ - the note isn't a named component. The shared explanation box is Dima's guess, agreed to but flagged as uncertain. |
| **2** - "strict developer casing standards (e.g. **PascalCase**)"; "Flag any generic, lowercase, or space-separated" names | `Button` with a capital B was an example of _matching dev_, not a casing rule. Casing is a checkable proxy, not the requirement. |
| **2** - silent on prop names | Half the item is that **prop names** match dev (`Start Icon` vs `Left Icon`). Missing from the PRD entirely. |
| **4** - a fixed global order: `Size`, `Variant`, `State`, then booleans | "variant before state, size first" - but the order is **per-project configurable**, and the item isn't part of every QA. |
| **6** - desktop `Paragraph 2 Regular` maps to `Mobile/Paragraph 2 Regular` | That naming convention appears nowhere in the call. What was said: mobile is a separate component on the same page, so the check needs to review two components, and she doubted the rule is universal. |
| **7** - "Log a warning if a component collapses to 0px" | Not mentioned. The ask is the min/max **recommendation** ("note, there aren't any"), and it's routinely skipped on less robust design systems. |
| **10** - "2px flags permitted strictly for micro-elements like borders or tight inline tags" | 2 is simply an accepted spacing value. No micro-element restriction was stated. |
| **10** - silent on icon sizes | 16/24/32/48, **plus 12, plus 14 as a configured exception**. |
| **13** - "Block compilation errors before pushing updates" | Design's own verdict is _"זה די מיותר"_; Figma already surfaces it. Kept because it's free, not because it's valuable. |
| **14** - "trigger an optimization suggestion" is right, but "Count the total levels of nested component **properties** exposed to the parent panel" | She counted **nested components** (the dropdown "has two"), not property depth. |
| **15** - silent on priority | Optional, usually absent, _"לא קריטי"_ - and she doubted it was worth automating. |
| **18** - "structural headers, anatomy breakdowns, usage specs, and component frames neatly sorted into their assigned regions" | Page exists, labels around the component, tidy. Nothing else. |
| **19** - "no component ships to production without its manual"; "minimum threshold of instructional content" | QA usually runs **before** documentation exists, so absent docs are normally not a finding. |
| - | The PRD omits all of [§ Cross-cutting requirements](#cross-cutting-requirements): the disposable QA section, descriptive per-item output, stage-2 visual evidence, per-project suppression checkboxes, and the hand-QA'd reference component. |

## Tier 3 candidates, ranked by what the source actually supports

The six items that were still `tier: null` in [`checklist-catalogue.ts`](../src/plugins/qa/checklist-catalogue.ts) when this document was written.

| Item | Status | Buildable core | Missing before it can be built |
|---|---|---|---|
| **19** Documentation | **shipped** `documentation` | Presence of a docs link, `pass` or `not_applicable` | Confirm with design that Figma's documentation-link field is where their docs live |
| **7** Responsiveness | **shipped** `responsive-bounds` | Are min/max width/height set, as advice | Nothing. "Doesn't break on resize" is the harder, separable half, and stays a manual tick on the row |
| **18** Page Template | blocked | Are the expected labels present around the component | The snapshot is **set-scoped** and the labels are page siblings, so this needs the collector's scope widened, plus a definition of "tidy" |
| **3** Check All the Props | **shipped** `variant-property-bindings` | Is every property actually *wired* in every variant | Nothing, for the wiring half. The icon/text colour invariant and long-text stress still need a definition of "breaks" and stay a manual tick |
| **1** Storybook Alignment + Note | **deferred** (2026-07-27) | Does a deviation note exist on the page | Deferred by decision: all Storybook-dependent work is parked, which also covers the prop-name half of item 2 |
| **6** Typography Desktop\|Mobile | blocked | Style correspondence across a desktop/mobile pair | Both the pairing rule and the correspondence rule; nothing in the call specifies either |

Note that none of these were pure snapshot checks.
`documentationLinks`, the four `min/max` fields and `propertyReferences` all had to be added to the collector first.
Item 18 is the sharp version of that problem: `ComponentSetSnapshot` deliberately stops at the component set, and item 18 is the first check that needs to see the page around it.

### The Figma modelling artifact behind item 3

The interview describes item 3 as cycling props and seeing nothing breaks, which reads as a dynamic check, and that is how it was filed.
The failure the item most often hides turned out to be structural, and it is nowhere in the call because it is an artifact of how Figma models properties rather than anything a designer would think to describe.

A boolean property's **definition** lives on the component set, so its toggle appears in the properties panel for every variant the moment it is created.
Its **binding** lives on one layer inside one variant, and does not propagate when variants are added or duplicated.
So a set ships where `Show Left Icon` is wired on Primary and silently missed on Ghost: the toggle is there, looks identical to a working one, and does nothing.
Figma raises no error and draws no distinction, and booleans default to off, so the evidence sits in a state nobody looks at.
Twelve variants and two booleans is twenty-four bindings.

Checking that by hand means twenty-four select-toggle-untoggle cycles, so in practice it is never checked, and it surfaces in a consumer's file weeks later rather than in the library.

The lesson worth keeping is that the source describes the **workflow** faithfully and cannot be expected to describe the **tool's** failure modes.
Reading item 3 only as written would have produced a render harness and left the actual defect in place.

### Partial automation is the norm, not the exception

Reading the source against what shipped shows several rows where a check covers only part of its item.
Item 7 is the one modelled explicitly so far, via a `manualRemainder` on the check result: the row states the outstanding work next to its status chip, because a green chip standing for an unperformed resize test is a false pass.
(Written when the row also carried a tick box; those were removed on 2026-07-30, and the remainder line now carries this alone.)

Item 19 is modelled the same way, for a different reason: the row claims usage guidance, examples and properties are documented, while the check only reads Figma's documentation-link field.
A link is evidence that documentation exists, never that its content is adequate.

The remainder belongs to the **check**, not to the catalogue entry, because whether work remains can depend on what the check found.
Item 19 asks for a content review only when a link exists; with no documentation there is nothing to read, and a static per-item string put "read the documentation" on the row precisely when there was none.
Item 7's is unconditional by contrast, since a set being unable to hold bounds says nothing about whether it survives a resize.

Item 3 is another, and unconditional like item 7's: the check establishes that every property is wired, while the item asks for combinations cycled, long text always, and icon colour following text colour.
Correct wiring says nothing about whether the states it exposes render correctly, so the tick is owed on every outcome.

The report also counts these rows separately, as `counts.partial`.
Without that, a run could report "0 manual" while rows 3, 7, 17 and 19 still owed a human review.

The same treatment is owed to at least these, all pre-existing:

- **Item 2** - `set-name-casing` checks casing only; matching dev's **prop names** is untouched.
- **Item 12** - ~~`description` checks the also-known-as line and misprint marker; the **Storybook link** she described is not verified.~~
  Closed 2026-08-06: `description` now recommends a Storybook link.
  The 2026-07-27 deferral was right about _comparing_ against Storybook and wrong about this - **link presence** needs no Storybook access, so it never depended on the deferral at all.

Item 2's remaining half is Storybook-dependent, so it stays parked by the 2026-07-27 deferral.
**Item 17** was the third and has since shipped its remainder: `themes` covers resolution integrity while the ask was visual, "looks good in all modes", so the row now names the modes to review and keeps a tick.
Its remainder is conditional like item 19's, because a set with no theme axis renders identically in every mode and has nothing to compare.

---

## Second pass: canvas comments, 2026-08-04

Shani left four comments on a rendered `QA Checklist — button` frame in the New test site file (node `7692:364063`, file `y2QUFXDZfSr1Lu9PGEauKE`), each pinned inside a specific row band.
This is a second primary source, later than the 2026-07-16 call, and where it contradicts the call it wins for the same reason the call wins over the PRD.
Three of the four are implemented; the fourth is parked on a question back to her.

### Item 2 - naming, now stated as a rule

> "component - pascal case, no spaces, there are '-' between words"

The call gave `Button` with a capital B as an example of matching dev, and § 2 above records that no casing rule was ever requested.
This comment is the first time the rule itself was stated, so it supersedes that note: **PascalCase or kebab-case, nothing else**.

The comment is self-contradictory as written, since PascalCase and dash separators are mutually exclusive.
Resolved with Dima as "either form is acceptable", which is what `isLegalSetName` implements.
A bare lowercase word is deliberately **not** treated as a one-word kebab name and fails, confirmed explicitly: the set she was reviewing is itself named `button`, so the rule flags its own subject, and that is intended rather than an oversight.

### Item 11 - the hover gate

> "dont check it if there is not any hover state at all in the component property"

The check already skipped a set with no prototype reactions, but that is a different question from the one she asked.
Her gate is whether the **set declares a hover state**; a set can declare `State=hover` and carry no reactions, or carry reactions and declare no hover state.
`interaction-hover-only` now gates on the declared state, read off the variants' property values because the snapshot carries no list of a property's legal options.

Known consequence, accepted: a disallowed trigger on a set with no hover state is now skipped where it used to fail.
The skip note names its reason so the declined row is visible rather than reading as a silent pass.

### Item 12 - the Storybook link

> "also check if there is a link for story book and recommend to add it"

This closes the item-12 half that § [_Partial automation is the norm, not the exception_](#partial-automation-is-the-norm-not-the-exception) above records as "parked by the 2026-07-27 deferral".
The deferral was right about comparing against Storybook and wrong about this: **link presence** needs no Storybook access, so it is checkable now.
Implemented as advice, never a gate - `low` severity, and the row cannot reach `fail` on its account, because a component with no Storybook entry yet is a normal state and not a defect in the Figma component.
Both places a link legitimately lives are searched: the description prose, and Figma's documentation-link field.

### Item 7 - text fill and truncation, still open

> "set rules like - text inside element need to be fill, and truncated after 1/2 rows"

Read literally: when a container is FILL horizontally, the text inside it must also be FILL and must truncate.
**Not implemented**, because the component she was reviewing disproves the literal reading.
Measured on `button` (`98:899`, 108 variants) over the REST API: every variant root is `HUG`, the `label` text is `HUG` with `maxLines: null` and `textTruncation: null`, and **no node anywhere in the set is `FILL` horizontally**.
A check gated as she described therefore returns `not_applicable` on the very set that prompted the comment.

The gap is that a button hugs its label by design and only becomes stretchable when an instance is dropped into a FILL container on a page - a context that is not present in the component set QA reads.
Tracked in [#169](https://github.com/tidy-dev-team/tidy-ds-toolbox/issues/169) with the three candidate designs, pending her answer to a single question: is `button` as it stands a fail she wants reported, or does the rule apply only to components already set to FILL?
