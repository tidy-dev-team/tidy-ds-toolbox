const esbuild = require("esbuild");

esbuild
  .build({
    entryPoints: ["src/code.ts"],
    bundle: true,
    outfile: "dist/code.js",
    platform: "browser",
    target: "es2017",
    format: "iife",
    logLevel: "info",
    minify: true,
    loader: {
      ".svg": "dataurl",
    },
    define: {
      "process.env.NODE_ENV": '"production"',
    },
  })
  .catch(() => process.exit(1));
