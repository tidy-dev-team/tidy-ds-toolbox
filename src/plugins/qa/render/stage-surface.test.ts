import { describe, it, expect } from "vitest";
import { FALLBACK_SURFACE, planStageSurface } from "./stage-surface";
import type { ThemeSnapshot } from "../snapshot";

const COLLECTION = "VariableCollectionId:1:2";

/** A resolved colour variable in the theme collection. */
function colour(name: string, light: string, dark: string) {
  return [
    name,
    {
      name,
      collectionId: COLLECTION,
      byMode: {
        "1:0": { ok: true as const, type: "COLOR", hex: light },
        "1:1": { ok: true as const, type: "COLOR", hex: dark },
      },
    },
  ] as const;
}

function theme(
  variables: Record<string, ThemeSnapshot["variables"][string]>,
): ThemeSnapshot {
  return {
    collectionId: COLLECTION,
    collectionName: "semantic colors",
    modes: [
      { modeId: "1:0", name: "light" },
      { modeId: "1:1", name: "dark" },
    ],
    variables,
  };
}

describe("planStageSurface", () => {
  it("paints each mode with a page surface token from the theme collection", () => {
    const [name, variable] = colour("bg/default", "#FFFFFF", "#111827");
    const plan = planStageSurface(theme({ [name]: variable }));

    expect(plan.source).toBe("token");
    // Named so a wrong pick is visible on the block rather than silently
    // misleading - the lesson #127 already learned for the collection pick.
    expect(plan.tokenName).toBe("bg/default");
    expect(plan.byMode).toEqual({ "1:0": "#FFFFFF", "1:1": "#111827" });
  });

  it("prefers the default-looking surface over other surfaces", () => {
    const plan = planStageSurface(
      theme(
        Object.fromEntries([
          colour("surface/card", "#F9FAFB", "#1F2937"),
          colour("bg/default", "#FFFFFF", "#111827"),
        ]),
      ),
    );

    expect(plan.tokenName).toBe("bg/default");
  });

  // A state surface is not the page: painting a hover background behind the
  // component would show it against a colour it never actually sits on.
  it("ignores state and component surfaces", () => {
    const plan = planStageSurface(
      theme(
        Object.fromEntries([
          colour("bg/interactive/brand/hover", "#7C3AED", "#8B5CF6"),
          colour("bg/interactive/brand/pressed", "#6D28D9", "#7C3AED"),
        ]),
      ),
    );

    expect(plan.source).toBe("fallback");
  });

  it("ignores colours that are not surfaces at all", () => {
    const plan = planStageSurface(
      theme(Object.fromEntries([colour("text/inverse", "#FFFFFF", "#111827")])),
    );

    expect(plan.source).toBe("fallback");
  });

  // A token that resolves in one mode but not another cannot be compared
  // against: half the point is that both stages show a real surface.
  it("rejects a surface that does not resolve in every mode", () => {
    const plan = planStageSurface(
      theme({
        "bg/default": {
          name: "bg/default",
          collectionId: COLLECTION,
          byMode: {
            "1:0": { ok: true, type: "COLOR", hex: "#FFFFFF" },
            "1:1": { ok: false, reason: "no-value" },
          },
        },
      }),
    );

    expect(plan.source).toBe("fallback");
  });

  // Variables reached through a shared style are resolved too (#16 needs them),
  // but they belong to another collection and say nothing about this theme axis.
  it("ignores surfaces from outside the theme collection", () => {
    const plan = planStageSurface(
      theme({
        "bg/default": {
          name: "bg/default",
          collectionId: "VariableCollectionId:9:9",
          byMode: {
            "1:0": { ok: true, type: "COLOR", hex: "#FFFFFF" },
            "1:1": { ok: true, type: "COLOR", hex: "#111827" },
          },
        },
      }),
    );

    expect(plan.source).toBe("fallback");
  });

  it("falls back to one neutral surface for every mode", () => {
    const plan = planStageSurface(theme({}));

    expect(plan.source).toBe("fallback");
    expect(plan.tokenName).toBeUndefined();
    // One tone, not a guess per mode: claiming to know each mode's surface is
    // exactly what we cannot do here. Dark rather than light so that a pale
    // element - which the white card would hide - shows up as pale.
    expect(plan.byMode).toEqual({
      "1:0": FALLBACK_SURFACE,
      "1:1": FALLBACK_SURFACE,
    });
  });
});
