/**
 * Types for the Audit plugin
 * Design system audit tool for annotating and reporting issues
 */

export type AuditAction =
  | "add-note"
  | "add-quick-win"
  | "generate-report"
  | "export-pdf"
  | "export-multipage-pdf"
  | "export-csv"
  | "update-from-canvas"
  | "erase-notes-on-canvas"
  | "erase-report"
  | "get-selection-state"
  | "check-report-exists";

export type SeverityLevel = "critical" | "high" | "medium" | "low";

export interface NotePayload {
  severity: SeverityLevel;
  title?: string;
  selectedNote?: string;
  note?: string;
}

export interface QuickWinPayload {}

export interface AuditResult {
  success: boolean;
  message: string;
  data?: any;
}

export interface SelectionState {
  hasSelection: boolean;
  isValid: boolean;
  message?: string;
}

export interface ExportPdfResult {
  success: boolean;
  data?: Uint8Array;
  message?: string;
}

export interface ExportMultipagePdfResult {
  success: boolean;
  pages?: Uint8Array[];
  message?: string;
}

export interface ExportCsvResult {
  success: boolean;
  data?: CsvData;
  message?: string;
}

export interface CsvData {
  [key: string]: {
    title: string;
    selectedNote: string;
    note: string;
    link: {
      type: string;
      value: string;
    };
    severity: string;
    quickWin: boolean;
  };
}

export interface CheckReportExistsResult {
  success: boolean;
  exists: boolean;
  entryCount?: number;
}

export interface SeverityConfig {
  name: string;
  symbol: string;
  value: number;
}

export interface DropdownOption {
  id: number;
  name: string;
}
