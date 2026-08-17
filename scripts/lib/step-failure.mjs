/**
 * What to print when a step of the dogfood loop fails (#190).
 *
 * The loop shells out with `stdio: "inherit"`, so every step it runs has
 * already said its piece on the terminal by the time it fails. Re-throwing on
 * top of that buries the useful part: last time, `verify-plugin` had diagnosed
 * the problem in plain words, and what the developer actually saw at the bottom
 * of the screen was an `execFileSync` stack, an `ErrnoException` dump and
 * `Node.js v24.10.0` - which reads as a crash in the tooling rather than a
 * verdict on their install.
 *
 * So the error object is deliberately not printed. The child already reported
 * itself; this only has to say which step it was and what to do next.
 *
 * Pure: returns lines, writes nothing.
 */
export function describeStepFailure(step) {
  return [
    `failed while ${step}.`,
    `The step's own output is above - that is the diagnosis, not this line.`,
  ];
}
