# Button exemplar for tidy-doc

Ground-truth reference:

- Figma file key: `CdytzPWDTc7npImeQG0Pnc`
- Source component node: `2543-1881`
- Existing documentation node: `2556-2317`
- Design notes source in this repo: `temp/documentation-idea.md`

This exemplar calibrates prose density, Section intent, and schema limits. It is not copied verbatim into every generated page.

## What the Button doc demonstrates

### Section order

The full documentation pattern is:

1. Variants
2. Component Breakdown
3. Mode
4. Usage Guidelines
5. Related Components

Cover/footer/branding are out of v1 scope.

### Variants

Button-like components usually split by type/kind family (for example `Primary`, `Secondary`, `Tertiary`, `Ghost`) and show state-spanning specimens (`Regular`/`Hover`/`Pressed`/`Disabled`, or equivalent). Good variant prose explains **decision context**:

- Primary: the main action in a focused flow.
- Secondary: supporting actions near a primary action.
- Tertiary/Ghost: lower-emphasis actions or dense surfaces.

Avoid visual-only prose like "This button is blue" unless the color itself is the usage distinction.

### Component Breakdown

The Button example uses anatomy documentation for size/height, width behavior, and icon support. Captions should interpret why the measurement matters, not duplicate the marker:

- Good: "Height scales by size while preserving the same interaction target pattern."
- Avoid: "The height is 40 px." (the marker already shows it)

### Mode

Mode examples document the component under theme/brand/density modes when bound variable collections exist. The caption should set the review intent:

> Compare the component across supported themes to check contrast, emphasis, and token-driven color changes.

The mode list itself is derived and rendered by the builder.

### Usage Guidelines

Good guidance is operational:

- Use for the main action in a form, dialog, or focused workflow.
- Avoid stacking multiple primary actions in the same decision area.
- Keep labels action-oriented and concise.

Do/Don't examples should be simple source-component scenes, and a full page targets 3–6 of them drawn from `dodont-patterns.md` (for Button: single primary per group, emphasis order, action-led labels, disabled misuse, destructive reservation). If a Button example would require a full surrounding layout, illustration, or a second unrelated component, skip it.

### Related Components

The Button exemplar surfaces siblings by token containment, not prefix: `Icon Button`, `Link Button`, and `Severity Button` are all related to `Button`. Guidance should explain choice:

- Use `Icon Button` when the action is compact and can be represented by a widely understood icon.
- Use `Link Button` for navigational actions that should read like inline or low-emphasis text.
- Use `Severity Button` when action emphasis is tied to destructive, warning, or success semantics.

## Example Doc Spec shape

This is illustrative. Real values must come from `tidy_doc_read_component` for the selected component.

```json
{
  "status": "IDEATION",
  "variants": {
    "Primary": {
      "description": "Use Primary for the main action in a focused flow.",
      "whenToUse": ["When the page or dialog has one clear next step."]
    },
    "Secondary": {
      "description": "Use Secondary for supporting actions that sit near a primary action.",
      "whenToUse": ["When the action is useful but not the main path."]
    }
  },
  "breakdown": {
    "heightCaption": "Height scales by size while preserving consistent interaction targets.",
    "iconPlacementCaption": "Icon variants reserve space for a leading symbol without changing the label rhythm."
  },
  "mode": {
    "caption": "Compare modes to verify token-driven contrast and emphasis changes."
  },
  "guidelines": {
    "whenToUse": ["Use for actions that submit, confirm, continue, or trigger a clear task."],
    "whenNotToUse": ["Avoid multiple primary buttons in the same decision area."],
    "general": ["Keep labels short, specific, and action-led."],
    "doDonts": [
      {
        "description": "Reserve Primary for the main action in a group.",
        "good": { "layout": "row", "instances": [{ "props": { "Type": "Primary" }, "labelOverride": "Save" }, { "props": { "Type": "Secondary" }, "labelOverride": "Cancel" }] },
        "bad": { "layout": "row", "instances": [{ "props": { "Type": "Primary" }, "labelOverride": "Save" }, { "props": { "Type": "Primary" }, "labelOverride": "Cancel" }] }
      },
      {
        "description": "Lead labels with the action so the outcome is clear before clicking.",
        "good": { "layout": "row", "instances": [{ "props": { "Type": "Primary" }, "labelOverride": "Create project" }] },
        "bad": { "layout": "row", "instances": [{ "props": { "Type": "Primary" }, "labelOverride": "OK" }] }
      },
      {
        "description": "Keep one size per action group; don't mix sizes to fake hierarchy.",
        "good": { "layout": "row", "instances": [{ "props": { "Size": "Medium", "Type": "Primary" }, "labelOverride": "Publish" }, { "props": { "Size": "Medium", "Type": "Secondary" }, "labelOverride": "Preview" }] },
        "bad": { "layout": "row", "instances": [{ "props": { "Size": "Large", "Type": "Primary" }, "labelOverride": "Publish" }, { "props": { "Size": "Small", "Type": "Secondary" }, "labelOverride": "Preview" }] }
      },
      {
        "description": "Show enabled actions by default; a disabled button hides why it can't be used.",
        "good": { "layout": "row", "instances": [{ "props": { "Type": "Primary" }, "labelOverride": "Submit" }] },
        "bad": { "layout": "row", "instances": [{ "props": { "State": "Disabled", "Type": "Primary" }, "labelOverride": "Submit" }] }
      }
    ]
  },
  "related": {
    "Icon Button": { "guidance": "Use Icon Button when the action is compact and the icon is universally understood." }
  }
}
```

## Limit calibration

The current schema limits are intentionally short and match the exemplar's density:

- variant descriptions ≤240
- variant bullets ≤6 × ≤120
- breakdown/mode captions ≤200
- guideline lists ≤8 items
- doDonts ≤6 pairs (editorial target: 3–6, see `dodont-patterns.md`)
- related guidance ≤160

If real Button prose needs to exceed these limits, tune the schema and this exemplar together.
