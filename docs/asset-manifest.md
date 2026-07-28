# The approved-asset manifest

QA check #8 (`asset-provenance`) asks whether a nested icon, illustration or logo really came from the approved Foundations library.
The plugin API cannot answer that on its own: `libraryName` exists only for variable collections, and an instance exposes its main component's `key` and `remote` flag but never a file key or library name.
A publish key *is* stable and globally unique, so a list of the keys Foundations publishes turns the unanswerable question into a lookup.
That list is the manifest.

See [`src/plugins/qa/asset-manifest.ts`](../src/plugins/qa/asset-manifest.ts) for the consuming code and issue #122 for the decision record.

## Generating it

```bash
FIGMA_TOKEN=figd_... npm run manifest:assets -- <fileKey> [<fileKey>...]
git add src/plugins/qa/asset-manifest.json && git commit
npm run build
```

The file key is the segment after `/design/` in the Foundations file URL.
Several keys are accepted, so a design system split across files still produces one manifest.

The token is a personal access token from Figma → Settings → Security, and needs `file_content:read` plus access to the file.
A 403 almost always means the scope is missing rather than the file being private, and the script says so.

The script never writes an empty manifest.
A file that publishes no components is an error, because an empty manifest would report every asset in the file as unapproved.

## What lands in the file

Facts only: publish key, component name, the page it sits on, and the owning component set when the component is a variant.
Keys are sorted, so regenerating produces a reviewable diff rather than a reshuffle.

Whether a page counts as *deprecated* is deliberately **not** in the manifest.
That rule lives in `isDeprecatedPage` in `asset-manifest.ts`, so it is unit-tested and reviewable, and regenerating the manifest can only change which components sit where, never what the verdicts mean.

## How the check reads it

| Manifest says | Verdict |
| --- | --- |
| Key found, current page | `pass`, genuinely verified, and the unverifiable-origin caveat is dropped |
| Key found, deprecated page | `fail` naming the page |
| Key absent | `warn`, naming the manifest's generation date |
| No manifest generated | `pass` with the unverifiable-origin caveat, exactly as before #122 |

A missing key is a warning rather than a failure on purpose.
An asset published after the manifest was taken is legitimately absent, and failing it would break QA for every newly published icon until someone regenerated.
The row names the date so a designer can tell the two cases apart.

## Refreshing

Regenerate whenever Foundations publishes new assets, then commit and release.
Between releases, newly published assets show up as unapproved warnings rather than passes, which is the cost of a committed manifest and the reason the row always names its date.

Two things worth checking on a regeneration:

- **Keys that disappeared.** The script warns when the count drops. Unpublishing an asset from the library is indistinguishable here from an accidental permission change, and both make previously-verified components start warning.
- **Pages that were renamed.** A page renamed *into* matching `isDeprecatedPage` turns every asset on it into a `fail` on the next run. That is usually the intent, but it lands as a hard failure across many components at once.
