# Content consistency is enforced by a validated Doc Spec schema, not requested by prompt

Authored documentation content (descriptions, when-to-use bullets, do/don't rationale, status) is constrained by a Zod schema validated at the MCP boundary on the way into `tidy_doc_build_page`. The schema imposes **hard** constraints: required slots, maximum lengths per slot, enumerated fields, and fixed item counts. Content that violates them is rejected before any layout happens; the model must trim or retry to fit.

This is the primary consistency mechanism. Two softer layers sit on top: skill-encoded per-Section authoring rules with the Button page as a worked exemplar, and derived facts injected from `tidy_doc_read_component` (never authored — see the facts-vs-judgment rule and ADR-0001).

## Why

The earlier cloud-skill attempt leaned on prompt instructions for consistency and it drifted — tone, length, and structure varied document to document. Consistency you *request* degrades; consistency you *enforce* at a validation boundary is a property of the system. Pairing this with code-as-template ([ADR-0006](0006-code-as-template-for-doc-layout.md)) makes both axes — layout and content shape — deterministic, which is the whole reason to rebuild rather than iterate the old skill.

## Consequences

- The Doc Spec Zod schema in `mcp-server/src/catalogue.ts` becomes the load-bearing contract; changing slot limits is a deliberate, reviewable edit, not a prompt tweak.
- The authoring model sometimes has to shorten or restructure to pass validation — accepted cost. The build never lays out malformed content.
- A **Kido editorial standard** (voice, tone, length conventions) does not yet exist and must be authored as part of this work; it lives with the skill and informs both the soft rules and the concrete schema limits.
- Hard limits risk truncating legitimately longer content; limits should be derived from the example doc and revisited if they bite.
