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

  /** Lift one string if it is an image data URL; otherwise hand it back. */
  const liftString = (value: string): string => {
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
  };

  // Iterative, with an explicit stack, because neither bounded nor unbounded
  // recursion works here:
  //
  // - A depth cap returned anything deeper untouched, silently recreating the
  //   very bug this module fixes - an image below the cap went back as base64
  //   text.
  // - Recursion with no cap throws `RangeError` at a few thousand levels, and
  //   V8's `JSON.stringify` does *not*: it handles 5,000 levels of nesting
  //   happily, and `JSON.parse` round-trips it. So a result the bridge can
  //   carry and the server can serialise would fail here and nowhere else,
  //   turning a returnable response into a hard error.
  //
  // The stack is heap-allocated, so nesting depth stops being a limit of this
  // module at all. Children are pushed in reverse so they pop in source order,
  // which keeps images in encounter order and object keys in their original
  // order.
  //
  // Terminates for any tree, which is what the bridge delivers (`JSON.parse`
  // output is acyclic by construction).
  interface Slot {
    parent: Record<string | number, unknown>;
    key: string | number;
    value: unknown;
  }
  const root: Record<string, unknown> = {};
  const stack: Slot[] = [{ parent: root, key: "value", value: result }];

  while (stack.length > 0) {
    // Guarded by the loop condition above - pop() cannot return undefined
    // here, but TypeScript's Array#pop signature can't express that.
    const slot = stack.pop();
    if (!slot) break;
    const { parent, key, value } = slot;

    if (typeof value === "string") {
      parent[key] = liftString(value);
    } else if (Array.isArray(value)) {
      const copy: unknown[] = new Array(value.length);
      parent[key] = copy;
      for (let i = value.length - 1; i >= 0; i--) {
        stack.push({
          parent: copy as unknown as Record<number, unknown>,
          key: i,
          value: value[i],
        });
      }
    } else if (value !== null && typeof value === "object") {
      const copy: Record<string, unknown> = {};
      parent[key] = copy;
      const entries = Object.entries(value);
      for (let i = entries.length - 1; i >= 0; i--) {
        stack.push({ parent: copy, key: entries[i][0], value: entries[i][1] });
      }
    } else {
      parent[key] = value;
    }
  }

  return { result: root.value, images };
}
