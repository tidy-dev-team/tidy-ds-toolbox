# Plan/Execute split for agent-facing Operations

To make agent-driven Figma work deterministic without baking DS knowledge into the plugin, every non-trivial mutating capability is split into two **Operations**: a `plan` Operation that returns an inspectable JSON plan (may use heuristics or LLM reasoning, may be non-deterministic), and an `execute` Operation that consumes a plan and produces the same diff every time. Read-only **Query Operations** sit alongside both, letting the agent learn DS state automatically and avoid bothering the designer.

## Consequences

- The unit of agent interaction is the **Operation**, not the **Module** or **Feature**. A Module may expose several Operations across the Query / Plan / Execute categories.
- Designers can review plans before execution when they want to; the agent can also self-approve simple cases and chain `plan → execute` without prompting.
- Existing modules (Sticker Sheet Builder, Tidy Mapper, Audit) need to be examined to find their natural plan/execute seam — some already have it implicitly.

## Carve-out: transient probe nodes in a Query Operation (2026-07-26, issue #102)

"Read-only" for a Query Operation means **read-only toward its target**, not "performs no document write at all".
`tidy_qa_run` creates and removes one temporary off-canvas frame in order to resolve variables per theme mode (see `src/plugins/qa/theme-probe.ts`).
Two checks depend on it: #17 themes (issue #102, which introduced the probe) and #16 high contrast (issue #103, which needs each colour token's value per mode to compute contrast ratios).
It is permitted under these conditions:

- The probe node is created, used and removed inside a single Operation call, in a `finally` so the error path cleans up too.
  Nothing survives a call that returns or throws.
  Clarified 2026-07-29 (issue #131): a call that is *killed* is a third case, and `finally` cannot cover it.
  Cancelling a plugin may tear the sandbox down rather than unwind it, which leaves the probe orphaned - carrying pinned modes - with no hook available to clean up on the way out.
  The lifecycle is now one function with an injected env (`ProbeEnv`), so this condition is testable rather than resting on reading the code.
  That is unprotectable from inside the plugin, so the condition is met on a best-effort basis by the next run instead: `sweepStrayProbes` clears stray probes before a run begins.
  Best-effort in three senses, worth stating plainly rather than implying a guarantee.
  It reads only the current page, so an orphan left on another page is not found until a run starts from that page.
  It runs only on a QA run that resolves theme modes at all, since a run requesting neither #16 nor #17 never enters this file.
  And a stray that cannot be removed is skipped rather than allowed to fail the call - cleaning up the previous run's residue must never break this one.
- A node is only swept when it carries this plugin's own plugin data (`markProbe` / `isStrayProbe`), never on its name alone.
  This condition is what keeps the carve-out to *our* transient nodes: a name match would have deleted a designer's own frame that happened to be called `__tidy-qa-mode-probe`, which the carve-out never licensed.
  The consequence of erring this way is that a probe orphaned in the instant between creation and marking is leaked rather than swept, which is the right direction to fail in.
- It is never a descendant of, and never modifies, the Operation's target.
- The Operation's MCP summary states it, so an agent reading the catalogue is not misled about what "query" implies here.

The reason it lives in the Query rather than only in the sibling Execute Operation: probing in one and not the other would leave the two QA surfaces silently disagreeing about what was checked, which is a worse failure than a documented exception.
The alternative implementations were reimplementing Figma's mode resolution in-plugin (silently wrong numbers, inherited by #16's contrast maths) and cloning the component set into a scratch page (disproportionate, and a much larger write).

A future Operation wanting the same latitude should be held to the three conditions above rather than treating this as a general licence.
