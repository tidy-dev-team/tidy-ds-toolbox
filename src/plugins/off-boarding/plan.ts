/**
 * What Off-Boarding decides, decided before anything is changed (#155).
 *
 * Pack and unpack both took the document apart as they went, so what they were
 * about to do existed nowhere a designer or a test could read it. Two ways to
 * lose work followed from that, and neither warned first: pack cleared any page
 * that merely carried the temporary page's *name*, and unpack, finding no
 * temporary page, silently treated whatever page the designer was looking at as
 * the source and took it apart into new pages.
 *
 * So the module decides first. A collector reads the file into `FileInventory`,
 * a plain JSON description with no Figma nodes in it; the functions here turn
 * that plus the designer's selection into either a plan or a typed refusal; and
 * an applier performs the plan.
 *
 * There is ONE plan shape and it serves three consumers: the confirmation dialog
 * renders it, the applier executes it, and the tests assert on it. That is
 * deliberate - a confirmation built from a separate description could drift from
 * the work performed, and then the dialog would be a lie.
 *
 * A refusal is a returned value, not a thrown error, so the UI can explain it
 * rather than showing a stack message.
 */

/** The marker Off-Boarding writes on a temporary page it created itself. */
export const TEMP_PAGE_MARKER_KEY = "tcc:tempPage";

/** The plugin-data key holding the packed record, written beside the marker. */
export const TEMP_PAGE_MANIFEST_KEY = "tcc:packManifest";

/** The name Off-Boarding gives a temporary page. Never proof of ownership. */
export const TEMP_PAGE_NAME = "__TCC_TEMP__";

/** One packed page, as recorded at pack time so unpack need not guess. */
export interface PackedPageRecord {
  /** The source page's name, restored verbatim on unpack. */
  name: string;
}

/**
 * What a pack wrote, stored with the packed content rather than beside it, so
 * unpack in a *different* file still knows the original page names.
 */
export interface PackManifest {
  version: 1;
  packedAt: string;
  pages: PackedPageRecord[];
}

/** One ordinary page, as the collector reads it. */
export interface PageSummary {
  id: string;
  name: string;
  /** Top-level children, which is what pack would clone into one frame. */
  topLevelNodeCount: number;
}

/** A page carrying the temporary name, whether or not it is actually ours. */
export interface TempPageSummary {
  id: string;
  name: string;
  /**
   * Whether the page carries our marker. A page can hold the name without the
   * marker - a designer's own page, or a copy - and that page is not ours.
   */
  marked: boolean;
  /** The packed frames on it, in canvas order, with the name each restores to. */
  frames: ReadonlyArray<{ restoresToPageName: string }>;
  /** The record pack wrote, when there is one. */
  manifest: PackManifest | null;
}

/** The file, as a plain description with no Figma nodes in it. */
export interface FileInventory {
  /** Every page that is not a temporary-page candidate. */
  pages: ReadonlyArray<PageSummary>;
  /** Every page carrying the temporary name, marked or not. */
  tempCandidates: ReadonlyArray<TempPageSummary>;
}

export type RefusalCode =
  | "no-pages-selected"
  | "temp-name-taken"
  | "no-packed-page"
  | "packed-page-empty";

/** A refusal the UI can explain, rather than an exception it can only report. */
export interface Refusal {
  ok: false;
  code: RefusalCode;
  message: string;
}

export interface PackPlan {
  ok: true;
  kind: "pack";
  /** The pages to pack, in the order they will be packed. */
  pages: ReadonlyArray<PageSummary>;
  /**
   * Pages that would pack into an empty frame. Named rather than dropped, so a
   * run against the wrong selection is visible before it happens.
   */
  emptyPageNames: ReadonlyArray<string>;
  /** Whether an existing marked temporary page is reused, or a new one made. */
  tempPage: { action: "create" } | { action: "reuse"; id: string };
}

export interface UnpackPlan {
  ok: true;
  kind: "unpack";
  tempPageId: string;
  /** The pages to create, in restore order, by the name each will carry. */
  pageNames: ReadonlyArray<string>;
  /**
   * True when the packed page carries no manifest, so the names come from the
   * frames themselves. A page packed by a build older than #155 is the ordinary
   * cause, and it still unpacks - the designer is just told where the names came
   * from.
   */
  namesFromFramesOnly: boolean;
}

function refuse(code: RefusalCode, message: string): Refusal {
  return { ok: false, code, message };
}

/**
 * The temporary page pack should use, or a refusal.
 *
 * A marked page is ours and is reused. An unmarked page holding the name is
 * refused rather than cleared: clearing it is what deleted a designer's own
 * content, and no name is proof of ownership.
 */
function resolveTempPageForPack(
  candidates: ReadonlyArray<TempPageSummary>,
): { action: "create" } | { action: "reuse"; id: string } | Refusal {
  const ours = candidates.find((candidate) => candidate.marked);
  if (ours) return { action: "reuse", id: ours.id };

  if (candidates.length > 0) {
    return refuse(
      "temp-name-taken",
      `A page named "${TEMP_PAGE_NAME}" already exists and was not created by ` +
        `Off-Boarding, so it will not be cleared. Rename or remove it, then ` +
        `pack again.`,
    );
  }

  return { action: "create" };
}

/**
 * What pack will do, or why it will not.
 *
 * An empty selection means every page, which is the common case and needs no
 * selection. It is not the same as a selection that matches nothing, which is a
 * refusal because the designer asked for something specific and did not get it.
 */
export function planPack(
  inventory: FileInventory,
  selectedPageIds: ReadonlyArray<string>,
): PackPlan | Refusal {
  const pages =
    selectedPageIds.length > 0
      ? inventory.pages.filter((page) => selectedPageIds.includes(page.id))
      : [...inventory.pages];

  if (pages.length === 0) {
    return refuse(
      "no-pages-selected",
      selectedPageIds.length > 0
        ? "None of the selected pages are still in this file."
        : "This file has no pages to pack.",
    );
  }

  const tempPage = resolveTempPageForPack(inventory.tempCandidates);
  if ("ok" in tempPage) return tempPage;

  return {
    ok: true,
    kind: "pack",
    pages,
    emptyPageNames: pages
      .filter((page) => page.topLevelNodeCount === 0)
      .map((page) => page.name),
    tempPage,
  };
}

/**
 * What unpack will do, or why it will not.
 *
 * There is no fallback to the current page. That fallback is what took a working
 * page apart: a designer who packed, deleted the temporary page by hand, and
 * clicked Unpack to undo got their own page dismantled instead. A refusal is the
 * correct answer to "there is nothing packed here".
 */
export function planUnpack(inventory: FileInventory): UnpackPlan | Refusal {
  const packed = inventory.tempCandidates.find((candidate) => candidate.marked);

  if (!packed) {
    if (inventory.tempCandidates.length > 0) {
      return refuse(
        "temp-name-taken",
        `A page named "${TEMP_PAGE_NAME}" exists but was not created by ` +
          `Off-Boarding, so it will not be taken apart.`,
      );
    }
    return refuse(
      "no-packed-page",
      `No packed page found. Unpack only works on a page Off-Boarding packed, ` +
        `and it will not take apart the page you are looking at.`,
    );
  }

  if (packed.frames.length === 0) {
    return refuse(
      "packed-page-empty",
      `The packed page "${packed.name}" holds no packed frames, so there is ` +
        `nothing to unpack.`,
    );
  }

  // The manifest is the record of what was packed; the frames are the content.
  // They can disagree only if something edited the packed page by hand, and the
  // frames are what actually exists, so they decide the count either way.
  const manifest = packed.manifest;
  const usable =
    manifest !== null && manifest.pages.length === packed.frames.length;

  return {
    ok: true,
    kind: "unpack",
    tempPageId: packed.id,
    pageNames: usable
      ? manifest.pages.map((page) => page.name)
      : packed.frames.map((frame) => frame.restoresToPageName),
    namesFromFramesOnly: !usable,
  };
}

/** One line per plan, for the confirmation dialog and the summary after. */
export function describePlan(plan: PackPlan | UnpackPlan): string {
  if (plan.kind === "pack") {
    const count = plan.pages.length;
    const noun = count === 1 ? "page" : "pages";
    const base = `Pack ${count} ${noun} into "${TEMP_PAGE_NAME}": ${plan.pages
      .map((page) => page.name)
      .join(", ")}.`;
    if (plan.emptyPageNames.length === 0) return base;
    const empties = plan.emptyPageNames.join(", ");
    return `${base} ${plan.emptyPageNames.length === 1 ? "This page is" : "These pages are"} empty and will pack to an empty frame: ${empties}.`;
  }

  const count = plan.pageNames.length;
  const noun = count === 1 ? "page" : "pages";
  const base = `Create ${count} ${noun} from the packed page: ${plan.pageNames.join(", ")}.`;
  return plan.namesFromFramesOnly
    ? `${base} The packed page carries no record of what was packed, so these names come from the packed frames.`
    : base;
}
