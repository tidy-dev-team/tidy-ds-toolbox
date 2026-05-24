---
description: Stamp the standard DS Template pages into the current Figma file. NOT idempotent — confirms first.
allowed-tools: ["mcp__tidy-ds-toolbox__tidy_ds_template_run"]
---

Run the Tidy DS Toolbox "DS Template" Execute Operation to stamp the standard design-system pages into the active Figma file.

User-supplied arguments (may be empty, may include `--force`): $ARGUMENTS

Behaviour:
- This operation is **NOT idempotent**. Running it twice creates duplicate pages.
- If `$ARGUMENTS` does NOT include `--force`, do NOT call the tool immediately. First tell the user that this stamps ~50 pages into the current file and is destructive-by-duplication, then ASK for explicit confirmation. If they confirm, call `mcp__tidy-ds-toolbox__tidy_ds_template_run` with an empty input `{}`.
- If `$ARGUMENTS` includes `--force`, skip the confirmation and call the tool directly.

After the call:
- On success, report `pagesCreated` and the first few `pageIds`.
- On `BRIDGE_DISCONNECTED`, tell the user to open the Tidy DS Toolbox plugin in Figma.
- On `TIMEOUT`, note that the operation may have partially completed and the user should check the file before retrying.
