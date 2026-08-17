/**
 * The read that turns Figma's throw into a value, and the readable/unreadable
 * split every consumer goes through.
 *
 * `collectSnapshot` itself is figma-touching and cannot be exercised here, so
 * the read is carved out structurally - a fake with a throwing getter is what a
 * flagged component set looks like from the collector's side, and that is the
 * one behaviour worth holding still.
 */

import { describe, it, expect } from "vitest";
import {
  readVariantProperties,
  readableVariants,
  refusalReason,
  unreadableVariants,
} from "./variant-properties";
import type { ComponentSetSnapshot, VariantSnapshot } from "./snapshot";

/** A variant node whose `variantProperties` getter throws, as Figma's does. */
function throwingSource(message: string) {
  return {
    get variantProperties(): Record<string, string> | null {
      throw new Error(message);
    },
  };
}

function variant(id: string, unreadable?: string): VariantSnapshot {
  return {
    id,
    name: id,
    variantProperties: unreadable ? {} : { Size: "Medium" },
    ...(unreadable ? { propertiesUnreadable: unreadable } : {}),
    tree: {
      id,
      name: id,
      type: "COMPONENT",
      visible: true,
      width: 0,
      height: 0,
      children: [],
    },
  };
}

function snapshot(variants: VariantSnapshot[]): ComponentSetSnapshot {
  return {
    id: "1:1",
    name: "Button",
    type: "COMPONENT_SET",
    description: "",
    propertyNames: [],
    properties: [],
    variants,
  };
}

describe("readVariantProperties", () => {
  it("returns the combination when the read succeeds", () => {
    expect(
      readVariantProperties({ variantProperties: { Size: "Medium" } }),
    ).toEqual({ properties: { Size: "Medium" } });
  });

  it("treats a null combination as an empty one, not a refusal", () => {
    expect(readVariantProperties({ variantProperties: null })).toEqual({
      properties: {},
    });
  });

  it("returns Figma's reason instead of throwing", () => {
    expect(readVariantProperties(throwingSource("existing errors"))).toEqual({
      unreadable: "existing errors",
    });
  });

  it("strips Figma's internal function name off the reason it reports", () => {
    // The exact message Figma raises, observed from a flagged set on a real
    // file: the reason is prefixed with the getter that threw. That prefix
    // reaches designers - it was printed into a toast and into tidy-doc's
    // build log - and `get_variantProperties` is a Figma API internal that
    // appears nowhere in this plugin's vocabulary (#188).
    expect(
      readVariantProperties(
        throwingSource(
          "in get_variantProperties: Component set for node has existing errors",
        ),
      ),
    ).toEqual({ unreadable: "Component set for node has existing errors" });
  });

  it("keeps a reason that carries no such prefix exactly as Figma gave it", () => {
    // Only Figma's own `in <fn>: ` shape is removed. Anything else is the
    // reason itself and is reported verbatim - guessing at more would risk
    // eating the sentence a designer needs.
    expect(
      readVariantProperties(
        throwingSource("Something else went wrong entirely"),
      ),
    ).toEqual({ unreadable: "Something else went wrong entirely" });
  });

  it("never yields a blank reason, since the reason is printed in a finding", () => {
    const result = readVariantProperties(throwingSource(""));
    expect(result).toEqual({ unreadable: "Figma gave no reason." });
  });
});

describe("readable / unreadable split", () => {
  it("splits on the flag, not on an empty combination", () => {
    // The first variant has no properties and was read fine - a standalone-shaped
    // variant. Keying on `{}` would call it unreadable.
    const readable = variant("1:2");
    readable.variantProperties = {};
    const snap = snapshot([readable, variant("1:3", "refused")]);

    expect(readableVariants(snap).map((v) => v.id)).toEqual(["1:2"]);
    expect(unreadableVariants(snap).map((v) => v.id)).toEqual(["1:3"]);
  });

  it("reports no refusal reason when nothing was refused", () => {
    expect(refusalReason(snapshot([variant("1:2")]))).toBeUndefined();
  });

  it("reports the first refusal reason, since Figma flags the set not the variant", () => {
    expect(
      refusalReason(snapshot([variant("1:2"), variant("1:3", "refused")])),
    ).toBe("refused");
  });
});
