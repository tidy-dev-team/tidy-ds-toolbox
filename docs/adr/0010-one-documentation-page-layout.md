# There is one Documentation Page layout: horizontal

Supersedes [ADR-0009](0009-layout-is-a-persisted-panel-setting.md).

A **Documentation Page** is always built in the **horizontal** layout.
The tidy-doc panel no longer offers a choice, nothing persists a choice, and no caller can pass one.
The vertical rendering code stays in the repository, compiled and unreferenced by any reachable path.

Three options were on the table:

- **(i) Remove the selector, keep everything else** — rejected. The orchestrator read the persisted value on every build, so a designer who had already chosen vertical would keep getting vertical with no way left to change it. Removing the control without removing the storage would strand exactly the people who had used the control.
- **(ii) Remove the selector and delete the vertical code** — rejected for now. The vertical sections (Header, the size-grouped variant matrix, Constraints redlines, the Dos and Don'ts grid) represent real work whose future is undecided. Deleting them is easy to do later and expensive to undo from scratch.
- **(iii) Remove the selector, the bridge action, the persistence and the override parameter; keep the rendering code parked behind one constant** — chosen.

## Why

The second layout was not earning its place. Two layouts mean two things to keep working, two things to review a change against, and a question every designer has to answer before they can document anything - and the answer is not one the tool can help them with. One layout removes that question.

Parking the code rather than deleting it is a bet that the vertical shape may come back, and it is a cheap bet: the sections still compile, so a refactor that breaks them breaks the build rather than rotting silently.

The one thing that makes "unreachable" true rather than merely "unlikely" is dropping the `figma.clientStorage` persistence. As long as a stored value was read at build time, the layout was still a live input with the UI simply hidden from it. Now the value is a constant in `buildDocPage`, and every other route to it is gone: no panel control, no `set-layout` bridge action, no override parameter, and nothing in the Doc Spec.

`DocLayout` keeps both members. A one-member union would force the vertical branch to be deleted or to stop compiling, which is the opposite of parking it.

## Consequences

- `buildDocPage` loses its `layoutOverride` parameter, and `buildDocPageUnguarded` resolves the layout from one annotated constant. Restoring the vertical layout is a one-line change there, plus whatever control is wanted to drive it.
- The tidy-doc bridge contract loses `set-layout`, `SetLayoutPayload`, `SetLayoutResult` and the `layout` field on `GetContextResult`. `DocLayout` is no longer re-exported from the module's `types.ts`; it is a private detail of the renderer.
- `docLayout.ts` keeps only the type and the default. `normalizeDocLayout`, `getPersistedDocLayout` and `setPersistedDocLayout` are gone, and so is the test that covered normalisation.
- Any `tidy-doc:layout` value already written to a designer's `figma.clientStorage` is now inert. It is not read, and it is not cleaned up - a stale key in client storage costs nothing, and a migration to delete it would be more code than the key is worth.
- The vertical builders (`buildVerticalHeader`, `buildVariantMatrixSection`, `buildConstraintsSection`, `buildDoDontGridSection`) and the chrome-less assembly path stay compiled and tested where tests exist. `matrixModel.ts` was never vertical-only - `deriveFacts` uses it - and is unaffected.
- ADR-0009's rejection of layout as a Doc Spec field still stands. This decision removes the choice; it does not move it into the content contract.
