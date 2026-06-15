#!/usr/bin/env node
// Build script: scan icon library packages, rasterize their SVGs, hash them,
// and write a generated module containing the embedded icon database.
//
// Run on demand only: npm run build:icon-db

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import fastGlob from "fast-glob";
const { glob } = fastGlob;
import { Resvg } from "@resvg/resvg-js";
import { phashFloat64 } from "../src/plugins/iconfinder/hash/core.ts";
import { rgbaToLetterboxGrayscale } from "../src/plugins/iconfinder/hash/preprocess.ts";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");

interface IconEntry {
  name: string;
  source: string;
  hash: string; // bigint serialized as hex string
}

interface LibrarySource {
  name: string;
  extractIcons: () => Promise<{ name: string; svg: string }[]>;
}

// ---------------------------------------------------------------------------
// SVG helpers
// ---------------------------------------------------------------------------

function svgDocument(innerSvg: string, viewBox = "0 0 24 24"): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}">${innerSvg}</svg>`;
}

function nodesToSvg(nodes: [string, Record<string, string>][]): string {
  return nodes.map((node) => nodeToSvg(node)).join("");
}

function nodeToSvg(node: [string, Record<string, string>] | unknown): string {
  if (!Array.isArray(node) || node.length < 2) return "";
  const [tag, attrs] = node;
  if (typeof tag !== "string" || typeof attrs !== "object" || attrs === null) {
    return "";
  }
  const attrString = Object.entries(attrs as Record<string, string>)
    .map(([k, v]) => `${k}="${v.replace(/"/g, "&quot;")}"`)
    .join(" ");
  return `<${tag} ${attrString}></${tag}>`;
}

function readSvgFile(filePath: string): string {
  return fs.readFileSync(filePath, "utf8");
}

// ---------------------------------------------------------------------------
// Library adapters
// ---------------------------------------------------------------------------

const tablerSource: LibrarySource = {
  name: "Tabler",
  extractIcons: async () => {
    const sets = [
      { dir: "outline", suffix: "" },
      { dir: "filled", suffix: "-filled" },
    ];
    const icons: { name: string; svg: string }[] = [];
    for (const { dir, suffix } of sets) {
      const base = path.join(
        repoRoot,
        "node_modules",
        "@tabler",
        "icons",
        "icons",
        dir,
      );
      const files = await glob("*.svg", { cwd: base, absolute: true });
      for (const file of files) {
        const baseName = path.basename(file, ".svg");
        icons.push({ name: `${baseName}${suffix}`, svg: readSvgFile(file) });
      }
    }
    return icons;
  },
};

const lucideSource: LibrarySource = {
  name: "Lucide",
  extractIcons: async () => {
    const base = path.join(
      repoRoot,
      "node_modules",
      "lucide",
      "dist",
      "esm",
      "icons",
    );
    const files = await glob("*.mjs", { cwd: base, absolute: true });
    const icons: { name: string; svg: string }[] = [];
    for (const file of files) {
      const baseName = path.basename(file, ".mjs");
      // Dynamic import of TS-stripped ESM modules.
      const mod = (await import(file)) as {
        default: [string, Record<string, string>][];
      };
      const nodes = mod.default;
      if (!Array.isArray(nodes)) continue;
      icons.push({
        name: baseName,
        svg: svgDocument(nodesToSvg(nodes)),
      });
    }
    return icons;
  },
};

const featherSource: LibrarySource = {
  name: "Feather",
  extractIcons: async () => {
    const base = path.join(
      repoRoot,
      "node_modules",
      "feather-icons",
      "dist",
      "icons",
    );
    const files = await glob("*.svg", { cwd: base, absolute: true });
    return files.map((file) => ({
      name: path.basename(file, ".svg"),
      svg: readSvgFile(file),
    }));
  },
};

const bootstrapSource: LibrarySource = {
  name: "Bootstrap",
  extractIcons: async () => {
    const base = path.join(
      repoRoot,
      "node_modules",
      "bootstrap-icons",
      "icons",
    );
    const files = await glob("*.svg", { cwd: base, absolute: true });
    return files.map((file) => ({
      name: path.basename(file, ".svg"),
      svg: readSvgFile(file),
    }));
  },
};

const mdiSource: LibrarySource = {
  name: "Material Design Icons",
  extractIcons: async () => {
    const base = path.join(repoRoot, "node_modules", "@mdi", "svg", "svg");
    const files = await glob("*.svg", { cwd: base, absolute: true });
    return files.map((file) => ({
      name: path.basename(file, ".svg"),
      svg: readSvgFile(file),
    }));
  },
};

const phosphorSource: LibrarySource = {
  name: "Phosphor",
  extractIcons: async () => {
    const base = path.join(
      repoRoot,
      "node_modules",
      "@phosphor-icons",
      "core",
      "assets",
      "regular",
    );
    const files = await glob("*.svg", { cwd: base, absolute: true });
    return files.map((file) => ({
      name: path.basename(file, ".svg").replace(/-regular$/, ""),
      svg: readSvgFile(file),
    }));
  },
};

const remixSource: LibrarySource = {
  name: "Remix",
  extractIcons: async () => {
    const base = path.join(repoRoot, "node_modules", "remixicon", "icons");
    const files = await glob("**/*.svg", { cwd: base, absolute: true });
    return files.map((file) => ({
      name: path.basename(file, ".svg"),
      svg: readSvgFile(file),
    }));
  },
};

const sources: LibrarySource[] = [
  tablerSource,
  lucideSource,
  featherSource,
  bootstrapSource,
  mdiSource,
  phosphorSource,
  remixSource,
];

// ---------------------------------------------------------------------------
// Hashing
// ---------------------------------------------------------------------------

function renderAndHash(svg: string, name: string, source: string): IconEntry {
  // Render at 64px width to match runtime export geometry, then letterbox
  // to 32×32 in the shared preprocessor.
  const resvg = new Resvg(svg, {
    fitTo: { mode: "width", value: 64 },
    background: "white",
  });
  const rendered = resvg.render();
  const { width, height, pixels } = rendered;

  const samples = rgbaToLetterboxGrayscale(
    pixels,
    width,
    height,
    32,
  );
  const hash = phashFloat64(samples);

  return {
    name,
    source,
    hash: `0x${hash.toString(16)}`,
  };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const entries: IconEntry[] = [];

  for (const source of sources) {
    console.log(`Scanning ${source.name}…`);
    const icons = await source.extractIcons();
    console.log(`  ${icons.length} icons found`);

    for (let i = 0; i < icons.length; i++) {
      const { name, svg } = icons[i];
      try {
        const entry = renderAndHash(svg, name, source.name);
        entries.push(entry);
      } catch (error) {
        console.warn(
          `  Failed to hash ${source.name}/${name}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }

      if ((i + 1) % 500 === 0 || i === icons.length - 1) {
        console.log(`  ${i + 1}/${icons.length} hashed`);
      }
    }
  }

  console.log(`\nTotal icons hashed: ${entries.length}`);

  const outputPath = path.join(
    repoRoot,
    "src",
    "plugins",
    "iconfinder",
    "db",
    "generated.ts",
  );
  const db = {
    generatedAt: new Date().toISOString(),
    count: entries.length,
    entries,
  };

  const fileContent =
    `// Generated by scripts/build-icon-db.ts — do not edit manually.\n` +
    `// This file is excluded from lint/format/typecheck.\n\n` +
    `export const ICON_DB_JSON = ${JSON.stringify(JSON.stringify(db))};\n`;

  fs.writeFileSync(outputPath, fileContent, "utf8");
  console.log(`Wrote ${outputPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
