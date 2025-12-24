/// <reference types="@figma/plugin-typings" />

/**
 * Audit plugin handler
 * Processes messages from the UI for design system auditing
 */

import type {
  AuditAction,
  AuditResult,
  NotePayload,
  SelectionState,
  CsvData,
} from "./types";
import { addNote } from "./utils/addNote";
import { addFrame } from "./utils/addFrame";
import { buildReport } from "./utils/report/buildReport";
import { updateFromCanvas } from "./utils/report/updateFromCanvas";
import { eraseNotesOnCanvas } from "./utils/report/eraseNotesOnCanvas";
import { exportDataForCSV } from "./utils/report/exportDataForCSV";
import {
  ALLOWED_TYPES,
  PLUGIN_DATA_NAMESPACE,
  REPORT_PAGE,
} from "./utils/constants";

// Font loading
async function loadFonts(): Promise<void> {
  await figma.loadFontAsync({ family: "Inter", style: "Regular" });
  await figma.loadFontAsync({ family: "Inter", style: "Bold" });
}

/**
 * Main audit handler - routes actions to appropriate functions
 */
export async function auditHandler(
  action: string,
  payload: any,
  _figma?: PluginAPI,
): Promise<any> {
  // Load fonts for any operation that might need them
  await loadFonts();

  switch (action as AuditAction) {
    case "add-note":
      return handleAddNote(payload as NotePayload);

    case "add-quick-win":
      return handleAddQuickWin();

    case "generate-report":
      return await buildReport();

    case "export-pdf":
      return await handleExportPdf();

    case "export-multipage-pdf":
      return await handleExportMultipagePdf();

    case "export-csv":
      return handleExportCsv();

    case "update-from-canvas":
      return updateFromCanvas();

    case "erase-notes-on-canvas":
      return eraseNotesOnCanvas();

    case "erase-report":
      return handleEraseReport();

    case "get-selection-state":
      return getSelectionState();

    default:
      return {
        success: false,
        message: `Unknown audit action: ${action}`,
      };
  }
}

/**
 * Check if current selection is valid for adding notes
 */
function getSelectionState(): SelectionState {
  const selection = figma.currentPage.selection;

  if (selection.length === 0) {
    return {
      hasSelection: false,
      isValid: false,
      message: "Please select at least one node",
    };
  }

  if (selection.length > 1) {
    return {
      hasSelection: true,
      isValid: false,
      message: "Please select only one node",
    };
  }

  if (!ALLOWED_TYPES.includes(selection[0].type)) {
    return {
      hasSelection: true,
      isValid: false,
      message: "Please select a frame, instance or component",
    };
  }

  return {
    hasSelection: true,
    isValid: true,
  };
}

/**
 * Add a severity note to the selected element
 */
function handleAddNote(payload: NotePayload): AuditResult {
  const selection = figma.currentPage.selection;
  const selectionState = getSelectionState();

  if (!selectionState.isValid) {
    figma.notify(selectionState.message || "Invalid selection");
    return {
      success: false,
      message: selectionState.message || "Invalid selection",
    };
  }

  const element = selection[0];
  const severity = payload.severity;

  // Prepare data for storage
  const data = {
    title: payload.title,
    selectedNote: payload.selectedNote,
    note: payload.note,
    link: {
      type: "NODE",
      value: element.id,
    },
    severity,
    quickWin: false,
  };

  // Store in shared plugin data
  figma.root.setSharedPluginData(
    PLUGIN_DATA_NAMESPACE,
    `${element.id}_${severity}`,
    JSON.stringify(data),
  );

  // Add visual elements
  addFrame(element, severity);
  const noteFrame = addNote(element, severity);

  // Add note content
  if (payload.title) {
    const titleText = figma.createText();
    titleText.characters = payload.title;
    titleText.fontName = {
      family: "Inter",
      style: "Bold",
    };
    noteFrame.appendChild(titleText);
  }

  const noteText = figma.createText();
  noteText.characters = `${payload.selectedNote ? payload.selectedNote + "\n" : ""}${payload.note || ""}`;
  noteFrame.appendChild(noteText);

  // Append note to parent
  element.parent?.appendChild(noteFrame);

  figma.notify(`Added ${severity} note`);

  return {
    success: true,
    message: `Added ${severity} note to ${element.name}`,
  };
}

/**
 * Mark the selected element as a quick win
 */
function handleAddQuickWin(): AuditResult {
  const selection = figma.currentPage.selection;
  const selectionState = getSelectionState();

  if (!selectionState.isValid) {
    figma.notify(selectionState.message || "Invalid selection");
    return {
      success: false,
      message: selectionState.message || "Invalid selection",
    };
  }

  const element = selection[0];
  const keys = figma.root.getSharedPluginDataKeys(PLUGIN_DATA_NAMESPACE);
  let updated = false;

  keys.forEach((key) => {
    if (key.includes(`${element.id}`)) {
      const value = figma.root.getSharedPluginData(PLUGIN_DATA_NAMESPACE, key);
      if (value) {
        try {
          const data = JSON.parse(value);
          data.quickWin = true;
          figma.root.setSharedPluginData(
            PLUGIN_DATA_NAMESPACE,
            key,
            JSON.stringify(data),
          );
          updated = true;
        } catch {
          // Skip invalid JSON
        }
      }
    }
  });

  if (updated) {
    figma.notify("Marked as Quick Win 🏆");
    return {
      success: true,
      message: "Marked as Quick Win",
    };
  }

  figma.notify("No existing note found for this element");
  return {
    success: false,
    message: "No existing note found for this element. Add a note first.",
  };
}

/**
 * Export report as single-page PDF
 */
async function handleExportPdf(): Promise<{
  success: boolean;
  data?: Uint8Array;
  message?: string;
}> {
  const reportFrame = findReportFrame();
  if (!reportFrame) {
    return {
      success: false,
      message: "Report frame not found. Generate a report first.",
    };
  }

  try {
    const pdf = await reportFrame.exportAsync({
      format: "PDF",
    });

    return {
      success: true,
      data: pdf,
    };
  } catch (error) {
    return {
      success: false,
      message: "PDF export failed",
    };
  }
}

/**
 * Export report as multi-page PDF
 */
async function handleExportMultipagePdf(): Promise<{
  success: boolean;
  pages?: Uint8Array[];
  message?: string;
}> {
  const reportFrame = findReportFrame();
  if (!reportFrame) {
    return {
      success: false,
      message: "Report frame not found. Generate a report first.",
    };
  }

  try {
    const pages: Uint8Array[] = [];

    for (const child of reportFrame.children) {
      if ("exportAsync" in child) {
        const pdf = await child.exportAsync({
          format: "PDF",
        });
        pages.push(pdf);
      }
    }

    if (pages.length === 0) {
      return {
        success: false,
        message: "No exportable sections found in report",
      };
    }

    return {
      success: true,
      pages,
    };
  } catch (error) {
    return {
      success: false,
      message: "Multi-page PDF export failed",
    };
  }
}

/**
 * Export report data as CSV
 */
function handleExportCsv(): {
  success: boolean;
  data?: CsvData;
  message?: string;
} {
  const data = exportDataForCSV();

  if (Object.keys(data).length === 0) {
    return {
      success: false,
      message: "No audit data to export",
    };
  }

  return {
    success: true,
    data,
  };
}

/**
 * Erase all report data
 */
function handleEraseReport(): AuditResult {
  const keys = figma.root.getSharedPluginDataKeys(PLUGIN_DATA_NAMESPACE);

  keys.forEach((key) => {
    figma.root.setSharedPluginData(PLUGIN_DATA_NAMESPACE, key, "");
  });

  figma.notify("Report data erased");

  return {
    success: true,
    message: `Erased ${keys.length} entries from report data`,
  };
}

/**
 * Find the report frame
 */
function findReportFrame(): FrameNode | null {
  const reportPage = figma.root.children.find(
    (page) => page.name === REPORT_PAGE,
  );

  if (!reportPage) {
    return null;
  }

  const reportFrame = reportPage.children.find(
    (frame) => frame.name === "report-frame",
  );

  if (reportFrame && reportFrame.type === "FRAME") {
    reportFrame.layoutMode = "VERTICAL";
    return reportFrame;
  }

  return null;
}
