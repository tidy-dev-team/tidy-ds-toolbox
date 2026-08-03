# Foundation pages are a divider-delimited range of the page list

Release Notes can now be filed against a **Foundation Page** as well as a Component Set, so the module has to answer "which pages are Foundation pages?".
Figma hands a plugin a flat, ordered list of pages with names and nothing else: there is no page group, no folder and no tag in the API, even though the sidebar visibly renders groups.
The grouping a designer sees is produced entirely by **divider pages** - a page whose name is made of dashes with a label in the middle.

We derive the Foundation area from that same convention.
A page whose name is mostly dashes is treated as a divider; the Foundation area is the run of pages after the first divider whose label matches `/foundation/i`, ending at the next divider or at the end of the list.
Membership is never stored.

## Considered options

- **(i) Divider-delimited range** - chosen.
  Reads the file exactly the way a human reads the sidebar, needs no setup in any file, and a newly added Foundation page appears in the dropdown with no plugin action at all.
  Costs a name-parsing heuristic, and a file whose dividers are spelled differently gets no Foundation area.
- **(ii) A name prefix on each page.**
  The target file happens to prefix every Foundation page with `↳`, so this would work today.
  Rejected because the arrow is a visual indent, not a statement of membership: the moment somebody indents a page under Components the rule reports it as Foundation, and a Foundation page that loses its arrow silently vanishes from the dropdown.
  It also depends on a convention that only this file follows, where the divider convention is Figma's own.
- **(iii) Both signals, arrow narrowing the range.**
  Strictest and hardest to fool, and rejected for that reason: its failure mode is a Foundation page disappearing with no error, which is worse than the over-inclusion it prevents.
- **(iv) The designer picks the pages once per file, stored in shared plugin data.**
  Never wrong and convention-independent.
  Rejected as the primary rule because it is manual setup in every file and goes stale the day Foundation gains a page, which is precisely when a release note about it is most likely.

## Consequences

- The heuristic is pure and lives apart from the Figma API: it takes `{ id, name }[]` and returns the Foundation slice, so every case (no divider, two dividers, empty area, divider last in the file) is fixture-tested without a canvas.
- A file with no matching divider has **no Foundation area**.
  Rather than showing an empty dropdown, the section falls back to offering every page and labels itself as doing so.
  The trade-off was accepted deliberately: a note can then be filed against a page that is not Foundation at all, and the label is the only thing preventing it.
- If more than one divider matches, the first wins and the rest are logged.
  Two Foundation areas in one file is a file problem, not a case worth modelling.
- The rule reads page **names only**, never page contents, so the dropdown stays cheap on a large file and needs no `dynamic-page` async loading.
- Changing the rule later re-scopes which notes could have been filed, but does not invalidate notes already filed: a note stores its Subject's page id, so it survives the page leaving the Foundation area.
