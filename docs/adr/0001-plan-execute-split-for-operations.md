# Plan/Execute split for agent-facing Operations

To make agent-driven Figma work deterministic without baking DS knowledge into the plugin, every non-trivial mutating capability is split into two **Operations**: a `plan` Operation that returns an inspectable JSON plan (may use heuristics or LLM reasoning, may be non-deterministic), and an `execute` Operation that consumes a plan and produces the same diff every time. Read-only **Query Operations** sit alongside both, letting the agent learn DS state automatically and avoid bothering the designer.

## Consequences

- The unit of agent interaction is the **Operation**, not the **Module** or **Feature**. A Module may expose several Operations across the Query / Plan / Execute categories.
- Designers can review plans before execution when they want to; the agent can also self-approve simple cases and chain `plan → execute` without prompting.
- Existing modules (Sticker Sheet Builder, Tidy Mapper, Audit) need to be examined to find their natural plan/execute seam — some already have it implicitly.
