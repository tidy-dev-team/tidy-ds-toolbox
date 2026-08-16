// The DS Template run's stop behaviour, and what it tells the designer (#184).
//
// Two levels. `describeStoppedRun` is pure - a sentence built from two counts
// and nothing else - so it is tested directly. `buildDsTemplate` is figma by
// definition and is driven here against a stand-in for the API, which is a
// heavier thing to keep true and is here for one reason: #184 restructured how
// every run stamps, so the uncancelled result needs pinning as much as the
// stopped one.

import { describe, it, expect, afterEach, vi } from "vitest";
import { buildDsTemplate, describeStoppedRun } from "./dsTemplate";
import { createCancellationToken } from "../../../shared/cancellation";

describe("describeStoppedRun", () => {
  it("says how far it got, in pages rather than percentages", () => {
    expect(describeStoppedRun(40, 70)).toContain("40 of 70");
  });

  it("says the stamped pages are still in the file and were not undone", () => {
    const message = describeStoppedRun(40, 70);

    // The run stopped, which is easy to read as "nothing happened". Forty
    // pages appeared, and the designer has to be told that before they can
    // decide anything else.
    expect(message).toMatch(/still in the file/i);
    expect(message).toMatch(/not undone/i);
  });

  it("warns that running again stamps a second template rather than resuming", () => {
    const message = describeStoppedRun(40, 70);

    // The obvious next action is to re-run, and this Operation is documented
    // as not idempotent - a second run adds seventy more pages beside these
    // instead of filling in the thirty that are missing.
    expect(message).toMatch(/again/i);
    expect(message).toMatch(/delete|remove/i);
  });

  it("does not claim a stop when the run in fact covered everything", () => {
    // Guards the caller's branch as much as the wording: this sentence is only
    // ever true of a run that stopped short.
    expect(describeStoppedRun(70, 70)).toBeNull();
  });
});

/**
 * `buildDsTemplate` against a stand-in for the Figma API.
 *
 * A regression guard rather than a red-first slice, and it is here for one
 * change in particular: #184 merged the build's two phases (every page created
 * empty, then every page furnished) into one page-at-a-time loop, which is what
 * lets a stopped run leave finished pages instead of a tail of empty ones. That
 * merge touches every run, the designer's panel button included, so the
 * uncancelled result is pinned here as much as the stopped one.
 *
 * The expected counts are read off the template list, not recomputed from it:
 * 58 pages that are not separators, of which 12 are Foundation subpages taking
 * one frame each and 46 take four.
 */
const REAL_PAGES = 58;
const EXPECTED_FRAMES = 12 * 1 + 46 * 4;

interface FakeNode {
  type: string;
  name: string;
  characters?: string;
  children: FakeNode[];
  appendChild(child: FakeNode): void;
  resize(): void;
  createInstance?(): FakeNode;
}

function fakeNode(type: string, name = ""): FakeNode {
  const node: FakeNode = {
    type,
    name,
    children: [],
    appendChild(child) {
      node.children.push(child);
    },
    resize() {},
  };
  return node;
}

function fakeFigma() {
  const pages: FakeNode[] = [];
  let componentsCreated = 0;
  const api = {
    loadFontAsync: async () => {},
    createPage: () => {
      const page = fakeNode("PAGE");
      pages.push(page);
      return page;
    },
    createFrame: () => fakeNode("FRAME"),
    createText: () => fakeNode("TEXT"),
    createComponent: () => {
      componentsCreated++;
      const component = fakeNode("COMPONENT");
      component.createInstance = () => {
        const instance = fakeNode("INSTANCE", component.name);
        for (const child of component.children) {
          const copy = fakeNode(child.type, child.name);
          copy.characters = child.characters;
          instance.children.push(copy);
        }
        return instance;
      };
      return component;
    },
  };
  return {
    api,
    pages,
    componentsCreated: () => componentsCreated,
  };
}

/** Every frame on the page carries a header instance - nothing half-built. */
function isFurnished(page: FakeNode): boolean {
  const frames = page.children.filter((child) => child.type === "FRAME");
  if (frames.length === 0) return false;
  return frames.every((frame) =>
    frame.children.some((child) => child.type === "INSTANCE"),
  );
}

describe("buildDsTemplate", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("stamps the whole template and claims no stop when nothing cancels it", async () => {
    const figma = fakeFigma();
    vi.stubGlobal("figma", figma.api);

    const build = await buildDsTemplate();

    expect(build.pages).toHaveLength(REAL_PAGES);
    expect(build.totalPages).toBe(REAL_PAGES);
    expect(build.cancelled).toBe(false);
    expect(figma.pages.every(isFurnished)).toBe(true);

    const frames = figma.pages.flatMap((page) =>
      page.children.filter((child) => child.type === "FRAME"),
    );
    expect(frames).toHaveLength(EXPECTED_FRAMES);
    // One header component for the file, instanced onto every frame - the
    // sharing survived being moved inside the per-page loop.
    expect(figma.componentsCreated()).toBe(1);
  });

  it("stops after a whole page, leaving finished pages and no empty ones", async () => {
    const figma = fakeFigma();
    vi.stubGlobal("figma", figma.api);
    // Flips once 40 pages exist, standing in for a cancellation that arrives
    // mid-run. The loop reads it between pages, never inside one.
    const token = {
      get isCancelled() {
        return figma.pages.length >= 40;
      },
      cancel() {},
    };

    const build = await buildDsTemplate(token);

    expect(build.cancelled).toBe(true);
    expect(build.pages).toHaveLength(40);
    expect(build.totalPages).toBe(REAL_PAGES);
    // The two together are the point: 40 pages exist and all 40 are complete.
    // The old two-phase build would have left 58, with 18 of them bare.
    expect(figma.pages).toHaveLength(40);
    expect(figma.pages.every(isFurnished)).toBe(true);
  });

  it("touches the file at all only if it was not already cancelled", async () => {
    const figma = fakeFigma();
    vi.stubGlobal("figma", figma.api);
    const token = createCancellationToken();
    token.cancel();

    const build = await buildDsTemplate(token);

    expect(build.pages).toEqual([]);
    expect(figma.pages).toEqual([]);
  });
});
