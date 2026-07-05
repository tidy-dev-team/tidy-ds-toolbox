/// <reference types="@figma/plugin-typings" />

// Backend handler for the Tidy Doc module UI. Signature matches the parent
// Tidy DS Toolbox module contract `(action, payload, figma?) => Promise<any>`.
//
// The primary consumer of tidy-doc is the skill calling the Operations in
// operations.ts over MCP, not this UI — see CLAUDE.md/#51. This handler only
// backs the minimal in-plugin shell: a bound fileKey readout and the
// fallback "Document selection" button.

import { TidyDocAction, GetContextResult, DocumentSelectionResult } from "./types";
import { deriveFacts } from "./utils/deriveFacts";
import { buildDocPage } from "./utils/buildDocPage";
import type { DocSpec } from "./utils/docSpec";

function getContext(): GetContextResult {
  return { fileKey: figma.fileKey ?? null };
}

/**
 * Facts-only build: no authored prose. Each family value's description is a
 * derived sentence, never an invented judgment, so the fallback button's
 * "facts-only" contract stays literal.
 */
async function documentSelection(): Promise<DocumentSelectionResult> {
  const selection = figma.currentPage.selection;
  if (selection.length !== 1) {
    throw new Error("Select exactly one component or component set to document.");
  }
  const [source] = selection;
  if (source.type !== "COMPONENT" && source.type !== "COMPONENT_SET") {
    throw new Error(
      `Selected node is ${source.type}, expected COMPONENT or COMPONENT_SET.`,
    );
  }

  const facts = await deriveFacts(source);
  const spec: DocSpec = {
    status: "IDEATION",
    variants: Object.fromEntries(
      facts.familyAxis.values.map((value) => [
        value,
        {
          description:
            facts.familyAxis.name === null
              ? `The \`${source.name}\` component.`
              : `\`${value}\` variant of \`${source.name}\`.`,
        },
      ]),
    ),
  };

  const root = await buildDocPage(source, spec);
  return {
    pageFrameId: root.id,
    sourceComponentId: source.id,
    sourceComponentName: source.name,
  };
}

export async function tidyDocHandler(
  action: TidyDocAction,
  _payload: unknown,
  _figma?: PluginAPI,
): Promise<unknown> {
  switch (action) {
    case "get-context":
      return getContext();
    case "document-selection":
      return await documentSelection();
    default:
      console.warn(`Unknown action: ${action}`);
      return null;
  }
}
