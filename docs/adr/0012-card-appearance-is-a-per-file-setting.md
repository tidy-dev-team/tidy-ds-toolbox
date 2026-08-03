# Card Appearance is a per-file setting, not a per-designer one

**Card Appearance**, the font family and background colour every Release Note Card and the Aggregate Changelog in a file are drawn with, is stored in `figma.root` shared plugin data, beside that file's sprints and notes.
It is **not** stored in `figma.clientStorage`.

This contradicts the storage half of [ADR-0009](0009-layout-is-a-persisted-panel-setting.md), which put a persisted panel setting in `clientStorage` and cited `tidy-icon-care` and `tags-spacings` as the pattern to follow.
That decision is not reversed for tidy-doc; the reasoning below is why Release Notes goes the other way.

Two options were on the table:

- **(i) Per file, in shared plugin data**: chosen.
  Everything else Release Notes persists already lives there: sprints, notes, the last selected Subject, the pasted file key.
  Every designer who opens the file sees the same choice, and a new team member inherits it with no setup.
- **(ii) Per designer, in `clientStorage`**: rejected.
  It matches ADR-0009 and the two existing modules, and it needs no per-file migration story.

## Why

A **Documentation Page layout** is a preference about how one designer likes to read.
A **Release Note Card** is a shared artifact sitting on a shared canvas, and a publish now redraws every card in the file.
Under (ii) designer A publishes the whole canvas in Satoshi on `#000A19`, designer B republishes it in Inter on white, and the cards flip between two designs with nothing on the canvas or in the panel explaining why.
Neither designer is wrong and neither can see the other's setting.

This is the same failure `src/plugins/qa/asset-manifest.ts` already cites when it rejects `clientStorage` for the approved-asset list, "where two designers could silently disagree about what approved means".
The rule that separates the two cases: **a setting that changes what lands on the canvas belongs to the file; a setting that changes what one person sees in the panel belongs to the client.**
ADR-0009's layout setting was arguably on the wrong side of that line too, but its artifact is rebuilt from a single source component by a single author, so the disagreement never became visible.

## Consequences

- **A publish redraws every Subject card, not only the published sprint's.** One appearance for the file means a partial redraw would leave a canvas holding two designs. This also fixes an existing bug that had nothing to do with appearance: a Subject card shows its history across every sprint, so editing or deleting an old note used to leave that card wrong until its Subject happened to appear in a published sprint. `publishSprintNotes(figma, sprints, sprint)` is now `publishNotes(figma, sprints)`; the selected sprint decides only whether there is anything worth publishing. The cost is that a publish is proportional to the file rather than to the sprint.
- **Kido's existing files restyle on their next publish.** They hold no stored value, so they take the new default of Inter, and because publish is whole-file they change all at once rather than gradually. Choosing Satoshi once per file before publishing avoids it.
- **The default is Inter, not Satoshi.** Satoshi is a Fontshare face, not a Google one, so Figma does not ship it and it resolves only where someone installed it. A default that cannot load is a default that always warns. `#000A19` stays the default background.
- **A publish deletes stamped cards only, across the whole file.**
  Whole-file because removing just the cards about to be redrawn leaves the ones that should no longer exist: delete the last note about a Subject and it drops out of the notes, so nothing rebuilds its card and nothing removes it either.
  The same applies to a Subject whose node has since been deleted.
  Stamped-only because a name is not proof.
  `Buttons-release-notes` is a card from a build older than the stamp, or a frame a designer made and named, and nothing can tell them apart.
  Publishing before this ADR matched those names (`isCardForSubject`, `isAggregateCard`) and so could delete a designer's frame.
  Publishing is routine and unconfirmed, so it now takes the rule that cannot be wrong.
  The costs are not symmetric: guessing wrong one way leaves a duplicate card, which is visible and fixable, and the other way destroys somebody's work silently.
  A publish counts the pre-stamp frames it leaves alone and reports them.
- **Delete from canvas uses explicit review and selection.**
  Clicking the control requests a preview and does not delete anything.
  The preview lists every top-level frame candidate with its frame name, page name, node ID, and ownership classification, and provides a way to focus the exact frame on the canvas.
  Verified stamped output is selected by default.
  An unverified legacy-name match is not selected by default because it may be a designer-owned frame.
  The user must select each unverified match separately before deletion.
  Cancel and closing the review overlay delete nothing.
  The final request contains only the selected node IDs.
  The plugin checks each selected node again and removes it only when it is still a top-level candidate.
  A stale node, a renamed legacy match, and an ordinary designer frame are skipped.
  If no candidates exist, the panel reports that result and does not open an empty review modal.
- **The foreground is derived, never stored, and every colour is checked rather than assumed.** Background luminance selects a light-on-dark or dark-on-light set, but selecting is not sufficient. The 0.179 crossover is where pure black and pure white tie; the sets use `#EEF3FC` and `#000A19`, so the dark set holds AA only to luminance 0.1596 and the light set only from 0.1879, leaving a nine-grey band where neither reaches 4.5:1 (`#747474` on `#EEF3FC` is 4.20:1). A bold colour that misses AA therefore falls back to pure black or white, whose worst case is 4.61:1 and so always clears it; a muted colour that misses AA falls back to the bold one, because no grey-blue contrasts with a mid grey. All pure, and verified by sweeping every grey plus a colour-cube sample rather than by hand-picked fixtures, which stepped straight over the band.
- **The picker only offers families carrying Regular, Medium and Bold**, the three styles a card draws with, so a font that would silently fall back cannot be selected in the first place. A fallback at publish time therefore means the font is absent on this machine, which the panel says on open rather than after a publish.
- **The five tag hues stay fixed** and are not part of Card Appearance. They are semantic rather than brand, and at 20% opacity they sit acceptably on either set. Only the badge label follows the derived text colour.
- **Appearance does not travel in the notes export.** Importing another client's notes cannot restyle your file.
- Release Notes exposes no Operations, so none of this reaches the agent-facing surface.
