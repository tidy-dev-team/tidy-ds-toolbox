// src/image-assets.d.ts

declare module "*.gif" {
  const content: string;
  export default content;
}
declare module "*.jpg" {
  const content: string;
  export default content;
}
declare module "*.png" {
  const content: string;
  export default content;
}
declare module "*.svg" {
  const content: string;
  export default content;
}

// Injected at build time by Vite's `define` from package.json version.
declare const __APP_VERSION__: string;

// Usage-analytics ingest config, injected at build time by Vite `define` (#43).
// __INGEST_TOKEN__ is empty unless TIDY_INGEST_TOKEN was set at build time.
declare const __INGEST_ENDPOINT__: string;
declare const __INGEST_TOKEN__: string;
