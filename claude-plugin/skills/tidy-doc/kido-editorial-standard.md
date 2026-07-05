# Kido editorial standard for generated component documentation

This standard governs authored prose in tidy-doc Doc Specs. Layout, measurements, modes, variant names, and specimens are generated from code/facts; this document covers the words the model authors.

## Voice

- Clear, practical, and design-system-native.
- Write as guidance for a designer using the component in a product UI.
- Prefer active voice and concrete usage conditions.
- Be helpful without sounding promotional.

Good:

> Use Primary for the main action on a page or in a focused flow.

Avoid:

> Primary buttons are beautiful, flexible, and perfect for many situations.

## Tone

- Calm and direct.
- No hype, jokes, or brand voice flourishes.
- No speculative product claims.
- No apologies or caveats unless the component facts genuinely require them.

## Length

Use the schema limits as hard maxima and these editorial targets as soft guidance:

- Variant `description`: 1 sentence, usually 80–180 characters, max 240.
- Variant `whenToUse`: 1–4 bullets, max 6; each bullet one specific condition.
- Breakdown captions: 0–1 sentence, max 200. Omit when the measurement is self-explanatory.
- Mode caption: 0–1 sentence, max 200. Explain what changes across modes, not the mode list itself.
- Guidelines bullets: 2–5 bullets when present, never filler.
- Do/Don't `description`: one short scenario/rationale, max 200.
- Related `guidance`: 1 sentence in the form "Use X when …", max 160.

## Wording rules

- Prefer "Use … when …" for prescriptive guidance.
- Prefer "Avoid … when …" for negative guidance.
- Use component names exactly as returned by `read_component`.
- Use variant values exactly as returned by `read_component` when referring to a concrete family/state/size.
- Do not mention implementation details like `pinnedDefaults`, `setExplicitVariableModeForCollection`, or `Doc Spec` in rendered prose.
- Do not over-explain obvious facts already shown by the specimen or marker.

## Never invent

Authored prose may interpret intent, but must not manufacture facts:

- Do not invent variant values, modes, measurements, sibling names, icon support, width constraints, or state availability.
- If the fact is absent, omit the corresponding statement or Section.
- If a usage rule would require a non-component scene, drop the Do/Don't example.

## Consistency calibration

The Button exemplar is the calibration source for density and style:

- Short paragraphs, not marketing copy.
- Practical "when to use" bullets.
- Anatomy captions only where they add interpretation.
- Related guidance explains choice between real sibling components.

If the exemplar and schema disagree, the schema wins. If the schema limits feel too tight in practice, file a follow-up to tune the Zod limits and this standard together.
