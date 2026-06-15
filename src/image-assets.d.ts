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
