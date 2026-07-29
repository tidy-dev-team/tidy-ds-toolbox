// Lifting images out of an operation result and into MCP image content blocks
// (issue #116).
//
// **The bug this exists to fix.** Every result used to be serialised into one
// text block. An operation that returns a rendered PNG (ds-explorer's
// `includeImage`) therefore handed the agent a base64 string inside JSON, which
// a model cannot see: it spent the render, the transfer and a great many tokens
// to convey nothing. MCP has a first-class image block, which Claude Code turns
// into a real vision input, so the payload only ever needed lifting out.
//
// **How a result declares an image, without the server knowing any operation.**
// By being a data URL. `data:image/png;base64,…` already names its own media
// type at the point of production, so there is nothing for an operation to
// register and nothing here to look up: any operation that returns one gets
// vision for free, and this module never learns a field name. The alternative -
// a per-operation list of image-bearing fields in the catalogue - would put
// knowledge of individual operations in the transport, which is what ADR-0004
// keeps out of it.
//
// The lifted string is replaced in the JSON by a short placeholder rather than
// deleted, so the result keeps its shape and the agent can see where the image
// went instead of finding a field silently missing.

/** An image ready to become an MCP image content block. */
export interface LiftedImage {
  /** Bare base64, no data-URL prefix - what the MCP image block carries. */
  data: string;
  /** e.g. "image/png". */
  mimeType: string;
}

export interface LiftImagesResult {
  /** The result with every lifted data URL replaced by a placeholder. */
  result: unknown;
  images: LiftedImage[];
}

/**
 * Media types worth lifting: the raster formats a vision model can actually
 * read. An SVG data URL is deliberately left as text - it is source, and it is
 * usefully readable where a PNG is not.
 */
const IMAGE_DATA_URL =
  /^data:(image\/(?:png|jpe?g|gif|webp));base64,([A-Za-z0-9+/]+={0,2})$/;

/**
 * Cap on images per response. A contact sheet operation could otherwise return
 * dozens and blow the response budget in a way that is hard to attribute. Over
 * the cap the placeholder says so, because silently dropping images would read
 * as "there were only ever this many".
 */
const MAX_IMAGES = 8;

/** Depth cap: results are JSON off the bridge, so this only guards pathology. */
const MAX_DEPTH = 12;

function describe(bytes: number, mimeType: string, index: number): string {
  const kb = (bytes / 1024).toFixed(1);
  return `<${mimeType}, ${kb} KB - returned as image block ${index + 1} of this response>`;
}

/**
 * Walk `result`, replacing every image data URL with a placeholder and
 * collecting the images in encounter order.
 *
 * Returns a copy; the input is not mutated. A result with no images comes back
 * with `images: []` and an untouched structure, so the caller can use one code
 * path for every operation.
 */
export function liftImages(result: unknown): LiftImagesResult {
  const images: LiftedImage[] = [];

  const walk = (value: unknown, depth: number): unknown => {
    if (depth > MAX_DEPTH) return value;

    if (typeof value === "string") {
      const match = IMAGE_DATA_URL.exec(value);
      if (!match) return value;
      const [, mimeType, data] = match;
      // Approximate decoded size: 4 base64 chars per 3 bytes.
      const bytes = Math.floor((data.length * 3) / 4);
      if (images.length >= MAX_IMAGES) {
        return `<${mimeType}, ${(bytes / 1024).toFixed(1)} KB - not returned: this response already carries the maximum of ${MAX_IMAGES} images>`;
      }
      const placeholder = describe(bytes, mimeType, images.length);
      images.push({ data, mimeType });
      return placeholder;
    }

    if (Array.isArray(value)) return value.map((v) => walk(v, depth + 1));

    if (value !== null && typeof value === "object") {
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(value)) out[k] = walk(v, depth + 1);
      return out;
    }

    return value;
  };

  return { result: walk(result, 0), images };
}
