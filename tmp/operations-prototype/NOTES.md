# Operations prototype — notes

## Question being answered

Do the proposed types from the ADRs survive contact with the two MVP operations
(Misprint Query + Execute, DS Template Execute)?

Specifically:

1. **Bridge envelope shape.** Is `{ id, operation, params } → { id, ok, result | error }`
   the right wire contract? Does serialising thrown `OperationError` (ADR-0003)
   feel clean when it crosses the bridge?
2. **Find → apply chaining.** Does the Query-then-Execute split read naturally
   when an agent has to thread `ids` from one call into the next? Or does it
   beg for a wrapping Plan Operation?
3. **Partial-failure semantics.** When `misprint.apply` is given mixed
   valid + invalid nodeIds, should it fail atomically with a typed error and
   `details.{missing,wrongType}`, or partial-succeed with per-id status?
   The prototype currently does atomic-fail. Press [4] and [5] to feel it.
4. **Session boundary.** Does the `FILE_SWITCHED` typed error model the
   one-Session-at-a-time MVP cleanly (CONTEXT.md)? Press [s] then any op.
5. **Operation discovery.** Does the `OPERATIONS` registry + dotted
   `<module>.<operation>` id shape feel like it scales to 30+ operations?
   Press [l] to dump the catalogue.

## Run it

```
npm run prototype:operations
```

Node 24 strips the `.ts` types natively; no extra deps.

## Answer (fill in after driving the TUI)

_TBD — capture the verdict here, then either fold the surviving types into
`src/shared/` and delete this directory, or rewrite both before another pass._

- **Bridge envelope:**
- **Find → apply chaining:**
- **Partial failures:**
- **Session boundary:**
- **Operation discovery:**

## What to lift if the types survive

- `types.ts` → `src/shared/operations/types.ts` (drop `OperationContext.fileKey`
  if it's already on the Session).
- `OPERATIONS` registry pattern → real registration in each module's
  `logic.ts`, collected by `moduleRegistry.ts`.
- `dispatch()` → the plugin-side bridge handler that consumes incoming
  `BridgeRequest` messages from the MCP server.

The TUI shell (`cli.ts`) is throwaway. Delete it.
