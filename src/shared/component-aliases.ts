/**
 * Single source of truth for the `Also known as:` description line (#176).
 *
 * The line lists the other names a component answers to, so a designer who
 * searches for "Progress Tracker" finds the set named "Stepper". It is the
 * search-by-vocabulary half of the same convention the misprint marker
 * (`shared/misprint.ts`) covers for search-by-keyboard-layout, and the QA
 * `description` check (#12) has always asked for it. Until now nothing wrote
 * it and no list of alternative names existed anywhere, so every component
 * failed that row.
 *
 * The table is curated by hand, not derived. Alternative names are what the
 * rest of the industry calls the thing, which is knowledge no Figma file
 * records. Names collide across entries on purpose: "Chip" is a fair
 * alternative name for both `Badge` and `Chips`, and the line exists to be
 * found, not to classify.
 *
 * A component with no entry gets no line. Writing an empty `Also known as:`
 * would satisfy the QA check while telling a reader nothing, which is worse
 * than the honest gap - the writer reports the missing names instead, so the
 * table grows from real use.
 */

/** #12 / #176 - the required alias line's prefix, written and checked. */
export const ALSO_KNOWN_AS_PREFIX = "Also known as:";

/** Matches an alias line, tolerant of the label's casing and leading space. */
const ALIAS_LINE = /^\s*also\s+known\s+as\s*:(.*)$/i;

export interface AliasEntry {
  /**
   * The component names this entry answers to.
   *
   * Names are matched head-first (see `lookupComponentAliases`), so one entry
   * covers a whole family: `Card` answers for "Card / With Image". A name that
   * a head-first match cannot reach - "Asset Badge", whose head is "Asset" -
   * has to be listed in its own right.
   */
  readonly names: readonly string[];
  /** The alternative names, in the order they are written. */
  readonly aliases: readonly string[];
}

/**
 * The alias table, one entry per concept in the Kido DS (the 93 components
 * registered in DS Explorer collapse into these), plus `Stepper`.
 */
export const COMPONENT_ALIASES: readonly AliasEntry[] = [
  {
    names: ["Avatar"],
    aliases: ["Profile Picture", "Profile Photo", "User Picture", "Userpic"],
  },
  {
    names: ["Avatar Group"],
    aliases: ["Avatar Stack", "Face Pile", "Stacked Avatars", "Avatar List"],
  },
  {
    names: ["Avatar Number"],
    aliases: ["Avatar Count", "Overflow Avatar", "Remaining Count"],
  },
  {
    names: ["Username"],
    aliases: ["User Name", "Display Name", "Handle", "Account Name"],
  },
  {
    names: ["Badge", "Asset Badge", "Text Badge", "Pill Badge"],
    aliases: ["Tag", "Label", "Pill", "Counter", "Status Indicator"],
  },
  {
    names: ["Breadcrumbs"],
    aliases: [
      "Breadcrumb Trail",
      "Path Navigation",
      "Page Path",
      "Navigation Trail",
    ],
  },
  {
    // `Btn` is the abbreviation real sets in the file are named with
    // (`BtnGroupHorizontal`), and an abbreviation is exactly the kind of name
    // a searching designer will not think to type.
    names: ["Button", "Buttons", "Btn"],
    aliases: ["CTA", "Call to Action", "Action Button", "Push Button"],
  },
  {
    names: ["Button Icon"],
    aliases: ["Icon Button", "Icon-only Button", "Action Icon"],
  },
  {
    names: ["Button Text"],
    aliases: [
      "Text Button",
      "Link Button",
      "Ghost Button",
      "Borderless Button",
    ],
  },
  {
    names: [
      "Checkbox",
      "Checkbox Icon",
      "Checkbox Item",
      "Checkbox Item Icon",
      "Checkbox Item Vector",
      "CheckboxVector",
    ],
    aliases: ["Check Box", "Tick Box", "Multi Select", "Selection Control"],
  },
  {
    names: ["Chip", "Chips"],
    aliases: ["Tag", "Pill", "Token", "Filter Chip", "Removable Tag"],
  },
  {
    names: ["Text Input"],
    aliases: ["Input Field", "Text Field", "Textbox", "Form Field"],
  },
  {
    names: ["Select Input"],
    aliases: ["Select", "Dropdown", "Combo Box", "Picker", "Select Menu"],
  },
  {
    names: ["Text Area"],
    aliases: [
      "Textarea",
      "Multiline Input",
      "Multi-line Text Field",
      "Comment Box",
    ],
  },
  {
    names: ["Numeric Input", "Number Input"],
    aliases: [
      "Number Field",
      "Spinner",
      "Quantity Selector",
      "Increment Input",
    ],
  },
  {
    names: ["Radio Button", "Radio", "Radio Button Item"],
    aliases: ["Option Button", "Single Select", "Radio Group", "Choice Button"],
  },
  {
    names: ["Link"],
    aliases: ["Hyperlink", "Anchor", "Text Link", "URL"],
  },
  {
    names: ["Slider"],
    aliases: ["Range Slider", "Range Input", "Track Bar", "Scrubber"],
  },
  {
    names: ["Search"],
    aliases: ["Search Field", "Search Bar", "Search Input", "Filter Field"],
  },
  {
    names: ["Tab", "Tabs"],
    aliases: ["Tab Bar", "Tab Group", "Tab Navigation", "Segmented Control"],
  },
  {
    names: ["Tooltip"],
    aliases: ["Tip", "Hint", "Info Bubble", "Hover Card", "Popover"],
  },
  {
    names: ["Toggle"],
    aliases: ["Switch", "Toggle Switch", "On/Off Switch", "Flip Switch"],
  },
  {
    names: ["Banner"],
    aliases: ["Inline Alert", "Callout", "Notification Banner", "Message Bar"],
  },
  {
    names: ["Alert", "Message", "Message Alert"],
    aliases: ["Inline Alert", "Status Message", "Callout", "Notice"],
  },
  {
    names: ["Dropdown"],
    aliases: ["Drop Down", "Menu", "Select Menu", "Combo Box", "Flyout Menu"],
  },
  {
    names: ["List"],
    aliases: ["List View", "Item List", "Option List", "Selection List"],
  },
  {
    names: ["Pagination"],
    aliases: ["Pager", "Page Navigation", "Paging", "Page Controls"],
  },
  {
    names: ["Pagination Dots"],
    aliases: ["Dot Indicator", "Page Dots", "Carousel Dots", "Page Indicator"],
  },
  {
    names: ["Progress Bar"],
    aliases: [
      "Progress Indicator",
      "Loading Bar",
      "Determinate Progress",
      "Meter",
    ],
  },
  {
    names: ["Progress Indicator"],
    aliases: ["Spinner", "Loader", "Activity Indicator", "Busy Indicator"],
  },
  {
    names: ["Snackbar"],
    aliases: ["Toast", "Flash Message", "Status Message", "Notification"],
  },
  {
    names: ["Toast"],
    aliases: ["Snackbar", "Flash Message", "Notification", "Popup Message"],
  },
  {
    names: ["Card"],
    aliases: ["Tile", "Panel", "Surface", "Content Card"],
  },
  {
    names: ["Date picker"],
    aliases: ["Datepicker", "Calendar", "Date Field", "Calendar Picker"],
  },
  {
    names: ["Year picker"],
    aliases: ["Year Selector", "Year Calendar", "Year Field"],
  },
  {
    names: ["Month picker"],
    aliases: ["Month Selector", "Month Calendar", "Month Field"],
  },
  {
    names: ["Modal"],
    aliases: ["Dialog", "Popup", "Lightbox", "Overlay", "Modal Window"],
  },
  {
    names: ["Table", "Table grid", "Table columns", "Table rows"],
    aliases: ["Data Grid", "Data Table", "Grid", "Spreadsheet"],
  },
  {
    names: ["Stepper"],
    aliases: [
      "Pagination",
      "Progress Tracker",
      "Progress Steps",
      "Wizard Indicator",
      "Step Indicator",
    ],
  },
];

/**
 * Fold a name to its comparable form: lowercase words separated by single
 * spaces. Everything else - slashes, parentheses, the 🟡 status emoji a
 * component name carries - is separator, so "Tabs / Outline Tab Bar" and
 * "Breadcrumbs 🟡" compare as the words they contain.
 *
 * Case boundaries are word boundaries too. The house convention (#2) is
 * PascalCase, so a real set is named `BadgeNotification`, not "Badge
 * Notification", and splitting only on punctuation would leave every such
 * name unmatched. `CTAButton` splits before the capitalised word rather than
 * inside the acronym.
 */
function normalizeName(name: string): string {
  return name
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

const BY_NORMALIZED_NAME: Map<string, AliasEntry> = (() => {
  const index = new Map<string, AliasEntry>();
  for (const entry of COMPONENT_ALIASES) {
    for (const name of entry.names) {
      index.set(normalizeName(name), entry);
    }
  }
  return index;
})();

/**
 * The alternative names for a component, or an empty list when the table has
 * no entry for it.
 *
 * Matching drops words from the end of the name until an entry is found, so
 * a family is covered by its head: "Slider / With Values and Marks" resolves
 * to `Slider`, and "Search / Simple / Outlined" to `Search`. The longest head
 * wins, which is what keeps "Numeric Input / Stepper 1" on `Numeric Input` -
 * the number spinner - rather than reaching the unrelated `Stepper` that
 * tracks progress.
 *
 * Only once every head has failed are tails tried, for the names that lead
 * with a qualifier instead of the component (`CTAButton`, `DangerAlert`).
 * Heads first, because the head of a component name is usually the component
 * and the tail its variation; a tail that wins a race against a head would
 * answer with the variation's concept.
 */
export function lookupComponentAliases(name: string): string[] {
  const words = normalizeName(name).split(" ").filter(Boolean);

  for (let length = words.length; length > 0; length -= 1) {
    const entry = BY_NORMALIZED_NAME.get(words.slice(0, length).join(" "));
    if (entry) return [...entry.aliases];
  }

  for (let start = 1; start < words.length; start += 1) {
    const entry = BY_NORMALIZED_NAME.get(words.slice(start).join(" "));
    if (entry) return [...entry.aliases];
  }

  return [];
}

/** Build the alias line for `aliases`. */
export function createAlsoKnownAsText(aliases: readonly string[]): string {
  return `${ALSO_KNOWN_AS_PREFIX} ${aliases.join(", ")}`;
}

/**
 * The alias names already written on an alias line, in their written order.
 *
 * Asterisks are stripped: Figma's description panel writes bold as markdown,
 * and a hand-written line often arrives as `**Pagination, Progress Tracker**`.
 * Reading those as part of the name would duplicate every one of them.
 */
export function parseAlsoKnownAsLine(line: string): string[] | null {
  const match = ALIAS_LINE.exec(line);
  if (!match) return null;

  return match[1]
    .split(",")
    .map((value) => value.replace(/\*/g, "").trim())
    .filter(Boolean);
}

/**
 * Write the alias line into `description`, and return the new description.
 *
 * An existing line is merged rather than replaced: a designer who added a
 * name the table does not know keeps it, and re-running writes nothing new.
 * A description with no line gets one at the top, where the reference in
 * #176 puts it - above the dashed separator that opens the misprint marker.
 *
 * With no aliases to write, the description is returned untouched.
 */
export function upsertAlsoKnownAsLine(
  description: string,
  aliases: readonly string[],
): string {
  if (aliases.length === 0) return description;

  const lines = description.split("\n");
  const index = lines.findIndex((line) => parseAlsoKnownAsLine(line) !== null);

  if (index === -1) {
    const line = createAlsoKnownAsText(aliases);
    return description.trim().length === 0 ? line : [line, ...lines].join("\n");
  }

  const existing = parseAlsoKnownAsLine(lines[index]) ?? [];
  const merged = [...existing];
  const seen = new Set(existing.map((alias) => alias.toLowerCase()));

  for (const alias of aliases) {
    if (seen.has(alias.toLowerCase())) continue;
    seen.add(alias.toLowerCase());
    merged.push(alias);
  }

  lines[index] = createAlsoKnownAsText(merged);
  return lines.join("\n");
}
