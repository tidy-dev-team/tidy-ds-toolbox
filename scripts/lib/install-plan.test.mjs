import { describe, it, expect } from "vitest";
import { planInstallStep } from "./install-plan.mjs";

describe("planInstallStep", () => {
  it("updates when the installed version differs from the one being assembled", () => {
    // The #190 incident, exactly: 1.17.1 installed, 1.17.2 assembled. `install`
    // reports "already installed" and does nothing, so the loop reported
    // success while serving a binary seventeen days old.
    const plan = planInstallStep({
      installedVersion: "1.17.1",
      assemblingVersion: "1.17.2",
    });

    expect(plan.verb).toBe("update");
  });

  it("reinstalls at an unchanged version, clearing the version-keyed cache first", () => {
    // The case the script already handled, and must keep handling: the cache is
    // keyed on version, so a same-version install finds the directory present
    // and leaves it alone. Deleting it first is what forces the re-copy (#130).
    const plan = planInstallStep({
      installedVersion: "1.17.2",
      assemblingVersion: "1.17.2",
    });

    expect(plan.verb).toBe("install");
    expect(plan.clearCache).toBe(true);
  });

  it("installs, not updates, when the plugin has never been installed", () => {
    // `update` on something absent is an error, so the absent case cannot be
    // folded into "the versions differ" even though technically they do.
    const plan = planInstallStep({
      installedVersion: null,
      assemblingVersion: "1.17.2",
    });

    expect(plan.verb).toBe("install");
    expect(plan.clearCache).toBe(false);
  });

  it("says why an update was chosen, naming both versions", () => {
    const plan = planInstallStep({
      installedVersion: "1.17.1",
      assemblingVersion: "1.17.2",
    });

    // A bare "updating..." would hide the one fact worth seeing: that the
    // installed copy was behind, and by how much.
    expect(plan.reason).toContain("1.17.1");
    expect(plan.reason).toContain("1.17.2");
  });
});
