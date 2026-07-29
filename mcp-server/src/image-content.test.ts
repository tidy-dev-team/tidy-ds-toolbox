import { describe, it, expect } from "vitest";
import { liftImages } from "./image-content";

const PNG =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==";
const PNG_URL = `data:image/png;base64,${PNG}`;

describe("liftImages", () => {
  it("lifts an image and leaves a placeholder in its place", () => {
    const { result, images } = liftImages({ name: "Button", image: PNG_URL });

    expect(images).toEqual([{ data: PNG, mimeType: "image/png" }]);
    // The field survives, so the result keeps its shape and the agent can see
    // where the image went rather than finding the key silently absent.
    const out = result as { name: string; image: string };
    expect(out.name).toBe("Button");
    expect(out.image).toMatch(/^<image\/png, [\d.]+ KB - returned as image block 1/);
    expect(out.image).not.toContain(PNG);
  });

  it("leaves a result with no image completely alone", () => {
    const input = { name: "Button", nested: [{ id: "1:2" }], n: 4, ok: null };
    const { result, images } = liftImages(input);
    expect(images).toEqual([]);
    expect(result).toEqual(input);
  });

  it("does not mutate the input", () => {
    const input = { image: PNG_URL };
    liftImages(input);
    expect(input.image).toBe(PNG_URL);
  });

  it("finds images nested in arrays and objects, in encounter order", () => {
    const jpeg = `data:image/jpeg;base64,${PNG}`;
    const { images } = liftImages({
      variants: [{ preview: PNG_URL }, { preview: jpeg }],
    });
    expect(images.map((i) => i.mimeType)).toEqual(["image/png", "image/jpeg"]);
  });

  // An SVG data URL is source a model can genuinely read, unlike a PNG, so it
  // is more useful left in the text than turned into an unreadable image block.
  it("leaves non-raster and malformed data URLs as text", () => {
    const svg = "data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=";
    const notBase64 = "data:image/png;base64,not valid base64!";
    const { result, images } = liftImages({ a: svg, b: notBase64 });
    expect(images).toEqual([]);
    expect(result).toEqual({ a: svg, b: notBase64 });
  });

  // An earlier depth cap returned anything nested deeper untouched, which
  // silently recreated the very bug this module exists to fix. Nesting depth is
  // not something a result should have to stay under to be seen.
  it("finds an image however deeply it is nested", () => {
    let value: unknown = { image: PNG_URL };
    for (let i = 0; i < 60; i++) value = { inner: value };

    const { result, images } = liftImages(value);
    expect(images).toEqual([{ data: PNG, mimeType: "image/png" }]);
    expect(JSON.stringify(result)).not.toContain(PNG);
  });

  it("caps the images it lifts and says so instead of dropping them", () => {
    const many = Array.from({ length: 10 }, () => PNG_URL);
    const { result, images } = liftImages(many);
    expect(images).toHaveLength(8);
    const out = result as string[];
    // The 9th and 10th are still accounted for, so a reader cannot mistake the
    // response for one that only ever had eight images.
    expect(out[8]).toContain("not returned");
    expect(out[9]).toContain("maximum of 8");
    expect(out[8]).not.toContain(PNG);
  });
});
