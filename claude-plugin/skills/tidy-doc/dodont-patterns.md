# Do/Don't pattern catalogue for tidy-doc

This catalogue exists so every generated Documentation Page ships with **3–6 Do/Don't
pairs**, not one. It distills recurring guidance from mature public design systems
(Atlassian, GOV.UK, IBM Carbon, Shopify Polaris, Adobe Spectrum, Microsoft Fluent,
Material 3, USWDS, Primer) — including the rows marked _recommended_ in the team's
collected do/don't research sheet — into pairs that are expressible inside tidy-doc's
hard constraint:

> A `SpecimenScene` may contain only 1–4 instances of the **source component itself**,
> configured via `props` (real axis values from `read_component`) and `labelOverride`
> (≤60 chars). No surrounding layout, no other components, no arbitrary nodes.

Every pattern below is written to survive that constraint. If a classic DS example
(e.g. "tooltip must not cover its trigger") cannot be expressed with source-component
instances alone, it is deliberately absent — never approximate it.

## How to use this catalogue

1. After `tidy_doc_read_component`, classify the component into one archetype below
   (or the closest one, for unique components).
2. Take every archetype pattern whose **requirements** are satisfied by the returned
   axes (family values, state values, size values, overridable label).
3. Top up from the **universal kit** until you have 3–6 pairs. Prefer 4+.
4. Ship fewer than 3 only when the axes genuinely cannot express more — dropping a
   pattern always beats bending the never-invent rule.

Requirements notation:

- `emphasis family` — the family axis encodes emphasis/kind (Primary/Secondary/…,
  Filled/Outline/Ghost, High/Medium/Low).
- `semantic family` — the family axis encodes meaning (Success/Warning/Error/Info,
  severity, status colors).
- `state axis` — Regular/Hover/Pressed/Disabled/Error/Selected or equivalent.
- `size axis` — S/M/L or equivalent.
- `label` — the component has visible text reachable via `labelOverride`.

## Universal kit

These apply to almost any component with the listed axis. Use them to reach the
3–6 target when archetype-specific patterns run out.

### U1 — One high-emphasis instance per group

_Requires: emphasis family. Source: Atlassian, Material 3, Polaris._

- Description: "Use one <top value> per decision area; support it with lower emphasis."
- Good: 1 top-emphasis + 1–2 lower-emphasis instances in a row.
- Bad: 2–3 top-emphasis instances side by side.

### U2 — Semantic value matches the message

_Requires: semantic family + label. Source: Atlassian lozenge, Carbon notification._

- Description: "Match the semantic variant to what the text actually says."
- Good: error/danger value with an error message label ("Payment failed").
- Bad: success value with the same error label.

### U3 — Consistent size within a group

_Requires: size axis. Source: Carbon, Fluent._

- Description: "Keep one size per group; don't mix sizes to fake hierarchy."
- Good: 2–3 instances at the same size.
- Bad: the same instances at mixed sizes.

### U4 — Concise, specific labels

_Requires: label. Source: GOV.UK content, Polaris content, Atlassian content._

- Description: "Lead with the action or the fact; cut filler words."
- Good: "Save changes" / "Approved" / "3 issues".
- Bad: "Click here to save the changes you made" (padded, indirect).

### U5 — Don't lean on Disabled to communicate

_Requires: state axis with a disabled-like value. Source: Spectrum, GOV.UK, Fluent._

- Description: "Show enabled instances by default; a disabled instance hides why it
  can't be used."
- Good: enabled instance with an actionable label.
- Bad: disabled instance carrying the same critical action.
- Exception: range-end pagination controls (Prev on page 1, Next on the last page)
  are the one place a disabled instance is the _correct_ example (Carbon). Don't
  turn this pattern against them.

### U6 — Restraint in quantity

_Requires: nothing special. Source: Polaris, Atlassian._

- Description: "A few instances communicate; a crowd competes."
- Good: 1–2 instances.
- Bad: 4 instances of varied values crowded in one row.

## Archetype patterns

### Actions — Button, Icon Button, Link Button, Split Button, FAB

_Sources: Atlassian buttons, Material 3 common buttons, Polaris actions, GOV.UK button._

- **A1 — Single primary per group** (= U1 specialized). Good: Primary "Save" +
  Secondary "Cancel". Bad: Primary "Save" + Primary "Cancel".
- **A2 — Emphasis order reads as hierarchy.** Requires: emphasis family with 3+ values.
  Good: Primary → Secondary → Tertiary in one row. Bad: Tertiary → Primary → Tertiary
  (emphasis buried mid-group).
- **A3 — Action-led verb labels.** Requires: label. Good: "Create project". Bad:
  "New" or "OK" for a consequential action (label says nothing about the outcome).
- **A4 — Destructive emphasis is reserved.** Requires: semantic/danger family value.
  Good: danger value labeled "Delete file". Bad: danger value labeled "Save" (alarming
  color on a safe action).
- **A5 — Sentence-case, no shouting.** Requires: label. Good: "Export report". Bad:
  "EXPORT REPORT!".
- **A6 — Equal-emphasis neighbors match.** Requires: emphasis family. Source:
  Material. Good: two instances of the same lower-emphasis value side by side
  ("Duplicate" / "Archive"). Bad: two different filled/high-emphasis values side by
  side competing for the same slot in the hierarchy.

### Inputs — Text Field, Text Area, Select, Combo Box, Search

_Sources: GOV.UK form guidance, Spectrum text field, Carbon form, Atlassian forms._

- **I1 — Error state carries a specific message.** Requires: error-like state value +
  label. Good: error state, "Enter a date after 2024". Bad: error state, "Invalid
  input".
- **I2 — Labels name the data, not the widget.** Requires: label. Good: "Email
  address". Bad: "Enter text here".
- **I3 — One size per form row** (= U3).
- **I4 — Disabled is not read-only.** Requires: state axis with both disabled and a
  readonly-like value. Good: readonly value showing a fixed value. Bad: disabled value
  used for the same purpose.
- **I5 — The label stays visible.** Requires: a label-visibility axis or boolean
  prop. Source: Material, Carbon. Good: field with its label shown ("Email address").
  Bad: the same field with the label hidden, leaving placeholder text as the only
  name for the data.

### Selection — Checkbox, Radio, Switch, Toggle, Segmented Control

_Sources: Fluent toggle, Atlassian toggle/checkbox, GOV.UK radios, Material selection._

- **S1 — Affirmative labels.** Requires: label. Good: "Send notifications". Bad:
  "Don't send notifications" (negated label makes on/off ambiguous).
- **S2 — Radios come in groups.** Radio-likes only. Good: 2–3 stacked instances with
  parallel labels. Bad: a single lone instance.
- **S3 — One selected in a mutually exclusive group.** Requires: selected-like state.
  Good: 3 instances, one selected. Bad: 3 instances, two selected.
- **S4 — Parallel option labels.** Requires: label. Good: "Weekly / Monthly / Yearly".
  Bad: "Weekly / Every month / Choose annual billing".
- **S5 — Label names the setting, not the state.** Toggle/switch-likes with a
  selected/on-like state. Source: Carbon, Primer. Good: "Notifications" shown once
  on and once off — same label. Bad: "Notifications are on" (the label restates the
  state, so it lies the moment the switch flips).

### Status — Badge, Tag, Chip, Lozenge, Pill

_Sources: Atlassian lozenge, Carbon tag, Polaris badge, Pajamas badge._

- **T1 — Semantic color matches meaning** (= U2). Good: success + "Approved". Bad:
  danger + "Approved".
- **T2 — One or two words.** Requires: label. Good: "New". Bad: "This item was added
  recently".
- **T3 — Badge restraint** (= U6). Good: 1–2 badges. Bad: 4 differently-colored badges
  on one row fighting for attention.
- **T4 — Consistent tone for the same meaning.** Requires: semantic family. Good: two
  instances, same value, both labeled "Active". Bad: two different semantic values both
  labeled "Active".
- **T5 — Don't disable a group.** Requires: state axis with a disabled-like value.
  Source: Spectrum tag. Good: 2–3 enabled instances. Bad: the same group all
  disabled — hide an unavailable group instead of greying it out wholesale.

### Feedback — Alert, Banner, Inline Message, Toast, Notification

_Sources: Carbon notification, Polaris banner, USWDS alert, GOV.UK error summary._

- **F1 — Severity matches content** (= U2). Good: error variant "Upload failed". Bad:
  info variant "Upload failed" (under-signals) or error variant "Upload complete"
  (over-signals).
- **F2 — Message states what happened and what to do.** Requires: label. Good: "Upload
  failed — retry or reduce file size". Bad: "Error occurred".
- **F3 — Don't stack same-severity noise.** Good: 1 instance. Bad: 3 warning instances
  in a column saying overlapping things.

### Navigation — Tabs, Breadcrumb item, Pagination, Menu Item, Nav Item

_Sources: Spectrum tabs, Fluent navigation, Pajamas navigation, Material tabs._

- **N1 — Short, parallel labels.** Requires: label. Good: "Overview / Activity /
  Settings". Bad: "Overview / See all recent activity / Configure".
- **N2 — Exactly one selected/active.** Requires: selected-like state. Good: 3
  instances, one active. Bad: two active at once.
- **N3 — Groups need at least two options.** Good: 2–3 instances. Bad: a single tab or
  nav item alone. For primary/bottom navigation items the floor is three destinations
  (Material) — show 3–4 good vs. 2 bad instead.
- **N4 — Icons all or none.** Requires: an icon-toggle axis or boolean prop. Source:
  Material navigation. Good: 3 items all with icons (or all without). Bad: the same
  group with icons on some items only.
- **N5 — No trailing ellipses in item labels.** Menu-item-likes with a label. Source:
  Spectrum. Good: "Export report". Bad: "Export report…" (the ellipsis adds noise
  without telling the user anything).

### Overlays & helpers — Tooltip, Popover trigger, Helper Text

_Sources: Atlassian tooltip, Spectrum contextual help, Carbon tooltip._

- **O1 — Supplementary, not essential.** Requires: label. Good: tooltip text adding
  context ("Refreshes every 5 min"). Bad: tooltip text carrying a required instruction
  the user can't otherwise see.
- **O2 — Don't restate the trigger.** Requires: label. Good: "Download as CSV". Bad:
  "Download" as a tooltip on a Download control.

### Data display — Avatar, Icon, Thumbnail, Progress, Skeleton

_Sources: Fluent avatar, Material progress, Carbon loading._

- **D1 — Consistent size in a set** (= U3). Good: an avatar row at one size. Bad: the
  same row at mixed sizes.
- **D2 — Progress restraint** (= U6). Good: one indicator. Bad: several indicators of
  mixed variants running at once.

## Unique components

When a component matches no archetype, do not skip Do/Don'ts. Instead:

1. **Map by axes, not by name.** An emphasis-like family → borrow from Actions + U1.
   A semantic family → borrow from Status/Feedback + U2. A selected-like state →
   borrow from Selection/Navigation. A size axis → U3. A visible label → U4.
2. **Convert your own bullets.** Take the 2–3 sharpest `whenToUse`/`whenNotToUse`
   bullets you already authored and express each as a pair: the good scene shows the
   condition met, the bad scene shows it violated — using only real axis values.
3. **Fall back to the universal kit** for the remainder.

A unique component with a family axis, a state axis, and a text label should still
comfortably reach 4 pairs (U1/U4/U5/U6 alone cover it).

## Quality bar for every pair

- The good and bad scenes must differ in exactly the way the `description` names —
  one variable at a time, so the lesson is legible at a glance.
- `description` states the rule, not the scene ("Reserve Primary for the main
  action", not "Left is good, right is bad").
- Both scenes use only axis names/values returned by `read_component`; `labelOverride`
  text is yours to author but must stay realistic product copy, ≤60 chars.
- No two pairs on a page may teach the same rule; if two patterns collapse into the
  same lesson for this component, keep the sharper one.
- If a pattern needs a second component, a layout container, or annotation to make
  sense — drop it. The never-invent rule outranks the 3–6 target.
