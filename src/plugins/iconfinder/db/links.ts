// Map a matched icon to its library's documentation page.
//
// The `source` strings are the display names written by the build script; the
// `name` is the database name, which encodes the build-time transforms we must
// undo here (Tabler "-filled" suffix; Phosphor already had "-regular" stripped
// at build time, so its base name is correct). Libraries without a per-icon
// deep link fall back to their icon browser.

export function docUrlFor(source: string, name: string): string | null {
  switch (source) {
    case "Tabler": {
      // Tabler's icon page hosts both outline and filled variants under the
      // base name; drop the "-filled" suffix the build script added.
      const base = name.replace(/-filled$/, "");
      return `https://tabler.io/icons/icon/${base}`;
    }
    case "Lucide":
      return `https://lucide.dev/icons/${name}`;
    case "Bootstrap":
      return `https://icons.getbootstrap.com/icons/${name}/`;
    case "Material Design Icons":
      return `https://pictogrammers.com/library/mdi/icon/${name}/`;
    case "Feather":
      // Single-page gallery; no per-icon route — deep-link the search query.
      return `https://feathericons.com/?query=${encodeURIComponent(name)}`;
    case "Phosphor":
      return `https://phosphoricons.com/?q=${encodeURIComponent(name)}`;
    case "Remix":
      return `https://remixicon.com/?search=${encodeURIComponent(name)}`;
    default:
      return null;
  }
}
