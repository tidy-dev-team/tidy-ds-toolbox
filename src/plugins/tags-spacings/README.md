# tags-spacings (parked)

This folder is not a plugin module.
"Tags & Spacings" was retired: it has no entry in `src/moduleRegistry.ts`, and that is deliberate, not an oversight.

## What moved out (and is live)

The measurement-marker code that `tidy-doc` actually depends on has moved to `src/shared/doc-markers/`.
That is the full import closure computed from three originally-named entry points (`buildSizeMarks`, `loadInterFont`, `SpacingsConfig`), not just those three files - `buildSizeMarks` reaches `getMarker`, which reaches `buildInternalComponents`, which unconditionally imports the tag- and spacing-marker builders and their shared helpers too.
The moved files are:

- `sizeMarks.ts`, `getMarker.ts`, `markerHelpers.ts`, `fontLoader.ts`
- `buildInternalComponents.ts`, `buildSizeMarkers.ts`, `buildSpacingMarkers.ts`, `buildTagComponents.ts`
- `colorStyles.ts`, `componentPropertyHelpers.ts`, `constants.ts`
- `types.ts` split: `SpacingsConfig`, `SpacingUnits`, and `SupportedContainerNode` moved to `src/shared/doc-markers/types.ts`

`src/plugins/tidy-doc/utils/buildBreakdownSection.ts` imports `buildSizeMarks`, `loadInterFont`, and `SpacingsConfig` from that new location.

## What is still here (and is parked, not dead)

`types.ts` keeps the rest of the old plugin's type definitions: `TagsConfig`, `TagDirection`, `IndexingScheme`, `TagsSpacingsSettings`, `ElementData`, `TagPlacement`, `FrameBounds`, `PaddingMeasurements`, `ElementCoordinates`, `TagsSpacingsResult`, the payload types, `SelectionInfo`, and the internal-tools status/result types.
These belong to the tag-annotation and internal-tools-panel side of the old plugin, which nobody imports today.
The recorded decision is that this module should come back, but not on the current Internal Tools page, so it is waiting for a home rather than being deleted.

If you are wondering whether this folder is safe to delete: it is not.
Ask before deleting or further trimming it.
This file itself is the note that should stop the next repository-wide dead-code sweep from reaching the same wrong conclusion the earlier one did.
