// Operation handlers for the DS Explorer module. Registered into the global
// Operation registry at module load (via src/shared/operations/register-all.ts).

import { ErrorCode, OperationError } from "../../shared/operations/errors";
import { registerOperation } from "../../shared/operations/registry";
import {
  componentRegistry,
  getAllComponentNames,
} from "./utils/componentData";
import {
  importComponent,
  getComponentPropertyInfo,
  getComponentDescription,
  getComponentImage,
  findExposedInstances,
} from "./logic";
import {
  localizeClone,
  LOCALIZE_LEVELS,
  type LocalizeLevel,
} from "./utils/localize";

function globToRegex(g: string): RegExp {
  const escaped = g
    .split("*")
    .map((s) => s.replace(/[.+?^${}()|[\]\\]/g, "\\$&"));
  return new RegExp("^" + escaped.join(".*") + "$");
}

interface ListComponentsParams {
  namePattern?: string;
}
interface ListComponentsResult {
  components: { name: string; key: string; type?: string }[];
  summary: string;
}

registerOperation<ListComponentsParams, ListComponentsResult>(
  {
    id: "tidy_ds_explorer_list_components",
    kind: "query",
    module: "ds-explorer",
    summary:
      "List the design-system components registered in DS Explorer (name + library key). Optionally filtered by a name glob (e.g. 'Avatar*'). Names returned here are the valid inputs to tidy_ds_explorer_get_component.",
    paramsExample: { namePattern: "Avatar*" },
  },
  async (params) => {
    const all = Object.values(componentRegistry);
    const pattern = params.namePattern ? globToRegex(params.namePattern) : null;
    const matches = pattern ? all.filter((c) => pattern.test(c.name)) : all;
    return {
      components: matches.map((c) => ({
        name: c.name,
        key: c.key,
        type: c.type,
      })),
      summary: `${matches.length} component(s)${pattern ? " matched" : ""}`,
    };
  },
);

interface GetComponentParams {
  name: string;
  includeImage?: boolean;
}
interface GetComponentResult {
  name: string;
  key: string;
  type?: string;
  description: string;
  properties: ReturnType<typeof getComponentPropertyInfo>;
  nestedInstances: { name: string; id: string; key: string }[];
  image?: string | null;
}

registerOperation<GetComponentParams, GetComponentResult>(
  {
    id: "tidy_ds_explorer_get_component",
    kind: "query",
    module: "ds-explorer",
    summary:
      "Import a registered DS Explorer component by name and return its properties, description, and nested instances. Set includeImage=true to also return a base64 PNG preview (heavier — only when the agent needs to actually see the component). Errors INVALID_PARAMS with details.availableNames if the name is unknown.",
    paramsExample: { name: "Avatar" },
  },
  async (params) => {
    if (!params.name || typeof params.name !== "string") {
      throw new OperationError(
        ErrorCode.INVALID_PARAMS,
        "name is required",
      );
    }

    const entry = componentRegistry[params.name];
    if (!entry) {
      throw new OperationError(
        ErrorCode.INVALID_PARAMS,
        `component '${params.name}' is not registered in DS Explorer`,
        true,
        { availableNames: getAllComponentNames() },
      );
    }

    let node;
    try {
      node = await importComponent(entry.key, figma);
    } catch (err) {
      throw new OperationError(
        ErrorCode.NOT_FOUND,
        `failed to import component '${params.name}' (key=${entry.key}): ${
          err instanceof Error ? err.message : String(err)
        }`,
        true,
        { name: params.name, key: entry.key },
      );
    }

    const properties = getComponentPropertyInfo(node);
    const description = getComponentDescription(node);
    const nestedInstances =
      node.type === "COMPONENT_SET"
        ? node.defaultVariant
          ? findExposedInstances(node.defaultVariant)
          : []
        : findExposedInstances(node);

    const result: GetComponentResult = {
      name: entry.name,
      key: entry.key,
      type: entry.type,
      description,
      properties,
      nestedInstances,
    };

    if (params.includeImage) {
      result.image = await getComponentImage(node);
    }

    return result;
  },
);

interface PlaceSetParams {
  name: string;
  pageId?: string;
  x?: number;
  y?: number;
  localize?: LocalizeLevel;
}
interface PlaceSetResult {
  nodeId: string;
  name: string;
  pageId: string;
  x: number;
  y: number;
  detachedInstances: number;
  localizedStyles: number;
}

registerOperation<PlaceSetParams, PlaceSetResult>(
  {
    id: "tidy_ds_explorer_place_set",
    kind: "execute",
    module: "ds-explorer",
    summary:
      "Place a registered DS Explorer component SET onto a page as an editable clone, ready to be labelled by tidy_component_labels_build. By default (localize='detach') the clone's nested instances are detached from Kido-DS into frames so the placed set no longer links those instances back to the library; variables/tokens are intentionally left bound to Kido-DS. Pass localize='none' for the old fully-linked behavior. Defaults to the current page and the viewport centre. Returns the new nodeId so it can be piped into tidy_component_labels_build. Errors WRONG_NODE_TYPE if the named component is a single component (not a set).",
    paramsExample: { name: "Buttons" },
  },
  async (params) => {
    if (!params.name || typeof params.name !== "string") {
      throw new OperationError(ErrorCode.INVALID_PARAMS, "name is required");
    }

    const localizeLevel: LocalizeLevel = params.localize ?? "detach";
    if (!LOCALIZE_LEVELS.includes(localizeLevel)) {
      throw new OperationError(
        ErrorCode.INVALID_PARAMS,
        `localize must be one of ${LOCALIZE_LEVELS.join(", ")}`,
        true,
        { localize: params.localize },
      );
    }

    const entry = componentRegistry[params.name];
    if (!entry) {
      throw new OperationError(
        ErrorCode.INVALID_PARAMS,
        `component '${params.name}' is not registered in DS Explorer`,
        true,
        { availableNames: getAllComponentNames() },
      );
    }

    let imported;
    try {
      imported = await importComponent(entry.key, figma);
    } catch (err) {
      throw new OperationError(
        ErrorCode.NOT_FOUND,
        `failed to import component '${params.name}' (key=${entry.key}): ${
          err instanceof Error ? err.message : String(err)
        }`,
        true,
        { name: params.name, key: entry.key },
      );
    }

    if (imported.type !== "COMPONENT_SET") {
      throw new OperationError(
        ErrorCode.WRONG_NODE_TYPE,
        `component '${params.name}' is a ${imported.type}, not a COMPONENT_SET — place_set is for variant sets`,
        true,
        { name: params.name, type: imported.type },
      );
    }

    await figma.loadAllPagesAsync();
    let targetPage: PageNode;
    if (params.pageId) {
      const page = figma.root.children.find((p) => p.id === params.pageId);
      if (!page) {
        throw new OperationError(
          ErrorCode.NOT_FOUND,
          `page ${params.pageId} not found`,
          true,
          { pageId: params.pageId },
        );
      }
      targetPage = page;
    } else {
      targetPage = figma.currentPage;
    }

    const clone = imported.clone();
    targetPage.appendChild(clone);

    const { detached, styles } = await localizeClone(clone, localizeLevel);

    const x =
      typeof params.x === "number"
        ? params.x
        : figma.viewport.center.x - clone.width / 2;
    const y =
      typeof params.y === "number"
        ? params.y
        : figma.viewport.center.y - clone.height / 2;
    clone.x = x;
    clone.y = y;

    if (targetPage.id === figma.currentPage.id) {
      figma.viewport.scrollAndZoomIntoView([clone]);
    } else {
      await figma.setCurrentPageAsync(targetPage);
      figma.viewport.scrollAndZoomIntoView([clone]);
    }

    return {
      nodeId: clone.id,
      name: clone.name,
      pageId: targetPage.id,
      x: clone.x,
      y: clone.y,
      detachedInstances: detached,
      localizedStyles: styles,
    };
  },
);
