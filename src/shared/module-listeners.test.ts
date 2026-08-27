import { describe, it, expect, beforeEach } from "vitest";
import {
  createModuleListeners,
  deactivateModule,
  onSelectionAndPageChanges,
  type ListenerEnv,
  type ListenerBinding,
} from "./module-listeners";

/** Records what was attached and detached, so a test can assert the pairing. */
function fakeEnv() {
  const attached: ListenerBinding[] = [];
  const detached: ListenerBinding[] = [];
  const env: ListenerEnv = {
    on: (binding) => attached.push(binding),
    off: (binding) => detached.push(binding),
  };
  return {
    env,
    attached,
    detached,
    /** Which event types are live right now. */
    live: () =>
      attached
        .filter((b) => !detached.includes(b))
        .map((b) => b.type)
        .sort(),
  };
}

const noop = () => {};

describe("createModuleListeners", () => {
  beforeEach(() => {
    // The registry is module state, so every test starts from a clean slate for
    // the ids it uses.
    deactivateModule("alpha");
    deactivateModule("beta");
  });

  it("attaches the bindings the module asked for", () => {
    const f = fakeEnv();
    const listeners = createModuleListeners("alpha", f.env);

    listeners.ensure(() => [
      { type: "selectionchange", handler: noop },
      { type: "documentchange", handler: noop },
    ]);

    expect(f.live()).toEqual(["documentchange", "selectionchange"]);
  });

  it("attaches once however many times a handler calls ensure", () => {
    // Every module handler calls this at the top of every action, so "once" is
    // the whole contract - `figma.on` with the same type twice runs the handler
    // twice per event.
    const f = fakeEnv();
    const listeners = createModuleListeners("alpha", f.env);
    const install = () => [
      { type: "selectionchange", handler: noop } as ListenerBinding,
    ];

    listeners.ensure(install);
    listeners.ensure(install);
    listeners.ensure(install);

    expect(f.attached).toHaveLength(1);
  });

  it("detaches every binding when the module is deactivated", () => {
    const f = fakeEnv();
    const listeners = createModuleListeners("alpha", f.env);
    listeners.ensure(() => [
      { type: "selectionchange", handler: noop },
      { type: "documentchange", handler: noop },
    ]);

    deactivateModule("alpha");

    expect(f.live()).toEqual([]);
  });

  it("detaches the very same handler reference it attached", () => {
    // `figma.off` matches on identity. Detaching a fresh closure removes
    // nothing and leaves the original running, which is the leak this exists
    // to close, reported as fixed.
    const f = fakeEnv();
    const handler = () => {};
    createModuleListeners("alpha", f.env).ensure(() => [
      { type: "selectionchange", handler },
    ]);

    deactivateModule("alpha");

    expect(f.detached).toEqual([{ type: "selectionchange", handler }]);
  });

  it("re-attaches when the module is used again after deactivation", () => {
    const f = fakeEnv();
    const listeners = createModuleListeners("alpha", f.env);
    const install = () => [
      { type: "selectionchange", handler: noop } as ListenerBinding,
    ];

    listeners.ensure(install);
    deactivateModule("alpha");
    listeners.ensure(install);

    expect(f.live()).toEqual(["selectionchange"]);
    expect(f.attached).toHaveLength(2);
  });

  it("leaves another module's listeners alone", () => {
    const f = fakeEnv();
    createModuleListeners("alpha", f.env).ensure(() => [
      { type: "selectionchange", handler: noop },
    ]);
    createModuleListeners("beta", f.env).ensure(() => [
      { type: "documentchange", handler: noop },
    ]);

    deactivateModule("alpha");

    expect(f.live()).toEqual(["documentchange"]);
  });

  it("ignores a module that installed nothing", () => {
    // The shell announces every deactivation, including modules with no
    // listeners at all, which is most of them.
    expect(() => deactivateModule("never-used")).not.toThrow();
  });

  it("survives a detach that throws, and detaches the rest anyway", () => {
    // Same reasoning as the QA probe sweep: one failure must not strand the
    // remaining listeners, because a stranded one is the bug.
    const attached: ListenerBinding[] = [];
    const detached: ListenerBinding[] = [];
    const env: ListenerEnv = {
      on: (b) => attached.push(b),
      off: (b) => {
        if (b.type === "selectionchange") throw new Error("figma said no");
        detached.push(b);
      },
    };
    createModuleListeners("alpha", env).ensure(() => [
      { type: "selectionchange", handler: noop },
      { type: "documentchange", handler: noop },
    ]);

    expect(() => deactivateModule("alpha")).not.toThrow();
    expect(detached.map((b) => b.type)).toEqual(["documentchange"]);
  });
});

describe("onSelectionAndPageChanges", () => {
  it("watches the three events, all through the one handler", () => {
    const notify = () => {};

    const bindings = onSelectionAndPageChanges(notify);

    expect(bindings).toEqual([
      { type: "selectionchange", handler: notify },
      { type: "currentpagechange", handler: notify },
      { type: "run", handler: notify },
    ]);
  });

  it("passes the handler by reference, so it can be detached again", () => {
    // The whole set shares one reference, and `figma.off` matches on identity.
    // Wrapping each arm in its own closure here would make three handlers that
    // look interchangeable and detach to three different things.
    const notify = () => {};

    expect(
      new Set(onSelectionAndPageChanges(notify).map((b) => b.handler)).size,
    ).toBe(1);
  });
});
