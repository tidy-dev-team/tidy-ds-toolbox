// Side-effect import that pulls in every module's operation registrations.
// Add a line here when a module starts exposing Operations.

import "../../plugins/utilities/operations";
import "../../plugins/component-labels/operations";
import "../../plugins/ds-explorer/operations";
import "../../plugins/tidy-doc/operations";
import "../../plugins/qa/operations";
// Test-only cancellation-path Operations (#192). Registered unconditionally -
// harmless (no Figma API, no document reads/writes) - but not reachable by an
// agent unless the MCP server's catalogue exposes them, which it does only
// under TIDY_ENABLE_TEST_OPERATIONS=1. See test-sleep-operations.ts's header
// comment for the full exposure reasoning.
import "./test-sleep-operations";
