import { describe, it, expect } from "vitest";
import { isRecoverableError } from "./error-handler";
import { ErrorCode, OperationError } from "./operations/errors";

describe("isRecoverableError", () => {
  it("reads an OperationError's own recoverable flag", () => {
    // A BUSY refusal is the designer-facing case (#187): the panel's Document
    // button refused because a build of that component is already running.
    // Waiting fixes it, so reporting it as a critical failure misleads - it
    // reaches the designer as an alarm about a plugin that is working fine.
    const refusal = new OperationError(
      ErrorCode.BUSY,
      "Button is already being built by an agent.",
      true,
    );

    expect(isRecoverableError(refusal)).toBe(true);
  });
});
