# Localhost-only Bridge, no auth (MVP)

**Amended 2026-08-03 (issue #161).**
The decision is unchanged: the Bridge stays unauthenticated.
What changed is that Operations now write to documents, and the original revisit trigger said "exposing destructive Operations" without saying what counts.
A trigger a reader cannot evaluate is not a trigger, so the two sections below name the two kinds of write and record which kind is exposed today.
The amendment also states where input validation sits, because the answer was implied by file layout and never written down.

The MCP server binds the Bridge websocket to `localhost:9876` and accepts any connection that arrives.
No token, no trust-on-first-use, no rate limiting.
The plugin's `manifest.json` whitelists exactly `ws://localhost:9876` under `networkAccess.devAllowedDomains`; production `allowedDomains` holds the usage-analytics ingest origin and never the Bridge socket, so the agent surface is dev-only.
Both endpoints use the `localhost` hostname rather than `127.0.0.1` because Figma's manifest validator rejects IP literals as "not a valid URL"; binding the server to the same name avoids IPv4/IPv6 resolution drift.

Considered: TOFU (server binds to the first connection that lands, rejects others) and a shared token pasted into the plugin UI on first launch. Rejected for MVP because this is a single-user dev tool and the simplest thing that works is enough until we expose more dangerous operations or ship to shared machines.

## Threat model accepted

- Any other process on the user's machine can connect to `127.0.0.1:9876` and impersonate the plugin or call operations as the plugin. We accept this because the MVP user is the developer themselves, on their own machine, running a tool they trust.
- Browser tabs cannot reach raw websockets on `127.0.0.1` without same-origin / DNS-rebinding tricks, but those are not ruled out.

## What "destructive" means here

Operations write to documents, and have since the documentation and QA modules shipped.
That alone does not fire the trigger, because two very different things are both "a write".

**Accepted, and not a trigger.**
An Operation creates content, or replaces content the plugin itself created and can identify by a marker it wrote.
The cost of getting this wrong is a duplicate or a stale artifact: visible on the canvas, and fixable by running the Operation again.

**Fires the trigger.**
An Operation deletes, moves, or rewrites content the plugin did not create and cannot prove it owns.
The cost of getting this wrong is somebody's work, silently, and Figma undo is the only recovery.
[ADR-0012](0012-card-appearance-is-a-per-file-setting.md) sets out why those two costs are not symmetric, in the context of a publish that had to choose between them.

One exposed Operation falls in the trigger class: `tidy_misprint_apply`.
It is accepted as a **named exception**, recorded below with its bounds, rather than argued into the accepted class.
That is the honest position, and it is why the trigger is worded as a class rather than a count.
No *further* Operation may enter the trigger class without revisiting this ADR first.

Both claims are checkable against the registered Operations, which is the point of stating them this way.
Thirteen Operations are registered: seven Query and six Execute.

Of the six Execute Operations:

- `tidy_doc_build_page` and `tidy_qa_build_checklist` delete prior output found by their own plugin-data stamp, never by name or position, then rebuild. Accepted class.
- `tidy_component_labels_build` removes duplicate labels from the set of text nodes it drew in the same call. Accepted class.
- `tidy_ds_explorer_place_set` clones a registered component set and de-links the clone, detaching nested instances and localizing styles. It removes nothing. (Variant pruning exists in the DS Explorer module, but on the designer-driven UI path only; the Operation does not reach it.)
- `tidy_ds_template_run` creates pages and removes nothing. It is not idempotent, so a second run leaves duplicate pages; that is a usability defect, not a destructive one.
- `tidy_misprint_apply` is the named exception. See below.

Of the seven Query Operations, five write nothing at all.
Two do write, and both are worth naming so that "Query" is not read as "leaves no trace".

`tidy_ds_explorer_get_component` imports the registered library component it was asked about, and does not remove it.
That is a document-level side effect which outlives the call: the file gains an imported library component.
It creates and removes nothing else, so it sits in the accepted class, but it is not nothing.

`tidy_qa_run` writes transiently, under the carve-out [ADR-0001](0001-plan-execute-split-for-operations.md) already documents: read-only means read-only *toward its target*, and its probe nodes are created, used and removed inside one call.
One detail belongs here rather than there.
The probes are marked with plugin data, so the sweep that reclaims them also reclaims a *previous* run's abandoned probes, which are nodes the current call did not create.
That still sits in the accepted class, because the marker is one the plugin wrote and nothing else carries it.

### The named exception: tidy_misprint_apply

`tidy_misprint_apply` writes into `description`, a field the designer authors.
It replaces the misprint line in place rather than appending a second one.
It identifies that line by the marker shape in `shared/misprint`, not by a stamp it wrote, and the match is deliberately tolerant of leading dashes and of casing so that a stale or renamed misprint is corrected instead of duplicated.
A designer-authored line shaped like a misprint line would therefore be overwritten.

By the definition above this is in the trigger class, not the accepted one.
The plugin cannot prove the line it overwrites is its own, and shape is not proof.
Calling it accepted would be reclassifying a fact to fit a rule, so it is recorded as an exception instead.

We accept the exception, bounded as follows.
The replacement touches one line and never more; the rest of a multi-line description is preserved.
The overwritten content is machine-generated scramble in every real case.
The alternative, never reapplying, leaves wrong search text in place, which is the defect the Operation exists to fix.

The exception does not extend to anything else.
A future Operation that wants the same latitude has to argue for it here, and the first thing it will be asked is why a stamp is not possible.

## Where input validation sits

The Zod schemas in the MCP server's catalogue **are enforcement at the MCP boundary, and are not a trust boundary for the plugin**.
Both halves matter, and stating only the second would contradict [ADR-0007](0007-schema-enforced-content-consistency.md), which makes the Doc Spec schema a load-bearing contract validated on the way in and is right to.

What they enforce is the agent's side of the contract: an agent that calls an Operation wrongly is rejected before the call reaches the socket, and the Doc Spec's slot limits hold because that validation runs.
What they cannot do is protect the plugin.
They sit in a separate process on the far side of the socket this ADR leaves unauthenticated, so anything that speaks the Bridge protocol directly bypasses them entirely.

They stay there.
The cost of moving them is not the library: Zod is already a plugin dependency and the documentation module already imports it.
The cost is a second copy of every schema, on the inside of the socket, that has to be kept in step with the catalogue the MCP server publishes.
That is real maintenance for protection this ADR already declines, because a local process able to send malformed parameters can equally send well-formed ones and mutate the file legitimately.

What follows instead is an obligation on handlers.
`dispatch` resolves the Operation and checks the Session; it does not validate parameters.
Every Operation handler therefore validates its own input and throws the typed error the [ADR-0003](0003-uniform-error-contract.md) contract requires, rather than assuming a schema ran upstream; the code's enum spells that case `INVALID_PARAMS`.
This is defence in depth against an agent that calls an Operation wrongly, which is the realistic failure, not against an attacker.

## Consequences

- Zero auth code in the Bridge for now.
- `manifest.json` `networkAccess` is as narrow as the format allows for the Bridge: one URL, dev-only.
- New Operation handlers own their parameter validation. A handler that trusts its parameters is a defect even though nothing enforces it yet. Issue #156 introduces a declared read-or-write effect per action, which is what an automated check would need; that check is deliberately not part of this ADR.
- Trigger to revisit: shipping to multiple users on shared boxes, exposing an Operation that deletes, moves, or rewrites content the plugin cannot prove it owns, or any report of a local-process attack vector.
