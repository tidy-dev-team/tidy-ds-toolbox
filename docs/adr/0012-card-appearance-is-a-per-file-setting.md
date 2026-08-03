# Card Appearance is a per-file setting, not a per-designer one

**Card Appearance** — the font family and background colour every Release Note Card and the Aggregate Changelog in a file are drawn with — is stored in `figma.root` shared plugin data, beside that file's sprints and notes.
It is **not** stored in `figma.clientStorage`.

This contradicts the storage half of [ADR-0009](0009-layout-is-a-persisted-panel-setting.md), which put a persisted panel setting in `clientStorage` and cited `tidy-icon-care` and `tags-spacings` as the pattern to follow.
That decision is not reversed for tidy-doc; the reasoning below is why Release Notes goes the other way.

Two options were on the table:

- **(i) Per file, in shared plugin data** — chosen.
  Everything else Release Notes persists already lives there: sprints, notes, the last selected Subject, the pasted file key.
  Every designer who opens the file sees the same choice, and a new team member inherits it with no setup.
- **(ii) Per designer, in `clientStorage`** — rejected.
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
- **The foreground is derived, never stored.** A stored pair therefore cannot describe an unreadable card. Background luminance selects a light-on-dark or dark-on-light text set, and a muted colour that misses WCAG AA against the chosen background is dropped for the bold one, because no grey-blue contrasts with a mid grey. All of it is pure and fixture-tested in `utils/appearance.ts`.
- **The picker only offers families carrying Regular, Medium and Bold**, the three styles a card draws with, so a font that would silently fall back cannot be selected in the first place. A fallback at publish time therefore means the font is absent on this machine, which the panel says on open rather than after a publish.
- **The five tag hues stay fixed** and are not part of Card Appearance. They are semantic rather than brand, and at 20% opacity they sit acceptably on either set. Only the badge label follows the derived text colour.
- **Appearance does not travel in the notes export.** Importing another client's notes cannot restyle your file.
- Release Notes exposes no Operations, so none of this reaches the agent-facing surface.
