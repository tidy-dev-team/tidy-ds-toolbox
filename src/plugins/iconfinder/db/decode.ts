// Decode the committed icon database.
//
// generated.ts ships the database as gzip-compressed, base64-encoded JSON to
// keep the inlined UI bundle small (the raw JSON is ~13 MB; gzip cuts it ~5x).
// We base64-decode and gunzip it once on first use. `atob` is a global in both
// the Figma UI iframe (browser) and Node 16+, so this works in the bundle and
// in build/eval scripts without branching. The base64 -> bytes step uses a
// preallocated buffer and an index loop rather than a per-character callback,
// since the binary string is ~3.9M characters and a callback there is a
// measurable chunk of first-use latency.

import { gunzipSync, strFromU8 } from "fflate";

import { ICON_DB_GZIP_B64 } from "./generated";

/** The raw database JSON string, decompressed from the embedded payload. */
export function decodeIconDbJson(): string {
  const binary = atob(ICON_DB_GZIP_B64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return strFromU8(gunzipSync(bytes));
}
