// Which of the Documentation Page layouts a build renders (#64).
//
// **Only horizontal is reachable.** The panel selector, the `set-layout` bridge
// action and the `figma.clientStorage` persistence behind it are all gone
// (ADR-0010 supersedes ADR-0009). The vertical rendering code is deliberately
// kept - see `buildDocPage` - but nothing in the plugin can select it.
//
// Dropping the persistence is what actually makes that true. Removing the
// selector alone would leave anyone who had already chosen vertical pinned to
// it forever, since the orchestrator read the stored value on every build and
// there would no longer be any way to change it back.
//
// The type keeps both members precisely so the parked code can stay: a
// one-member union would force the vertical branch to be deleted or to stop
// compiling, which is the opposite of parking it.

export type DocLayout = "horizontal" | "vertical";

export const DEFAULT_DOC_LAYOUT: DocLayout = "horizontal";
