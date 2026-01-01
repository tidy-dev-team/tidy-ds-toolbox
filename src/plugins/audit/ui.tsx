import { useCallback, useEffect, useRef, useState } from "react";
import { Card, FormControl } from "@shell/components";
import { postToFigma } from "@shared/bridge";
import type {
  AuditAction,
  SeverityLevel,
  DropdownOption,
  CsvData,
} from "./types";
import { dropdownOptions } from "./utils/dropdownOptions";
import { exportCsv } from "./utils/exportCsv";
import { createMultiPagePdf, downloadPdf } from "./utils/createMultiPagePdf";

interface PendingRequest {
  onSuccess?: (result: any) => void;
  onError?: (error: string) => void;
  onFinally?: () => void;
}

// Severity button config
const SEVERITY_BUTTONS: {
  severity: SeverityLevel;
  label: string;
  bgColor: string;
}[] = [
  { severity: "low", label: "Low", bgColor: "#82cf35" },
  { severity: "medium", label: "Medium", bgColor: "#ffc704" },
  { severity: "high", label: "High", bgColor: "#ff8d3c" },
  { severity: "critical", label: "Critical", bgColor: "#f0353b" },
];

export function AuditUI() {
  // State
  const [note, setNote] = useState<string>("");
  const [selectedSection, setSelectedSection] = useState<DropdownOption | null>(
    null,
  );
  const [predefinedNotes, setPredefinedNotes] = useState<DropdownOption[]>([]);
  const [selectedNote, setSelectedNote] = useState<DropdownOption | null>(null);
  const [isProcessing, setIsProcessing] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showPdfDialog, setShowPdfDialog] = useState<boolean>(false);
  const [showEraseDialog, setShowEraseDialog] = useState<boolean>(false);
  const [hasReport, setHasReport] = useState<boolean>(false);

  const pendingRequests = useRef(new Map<string, PendingRequest>());

  // Check if report exists on mount
  useEffect(() => {
    sendRequest(
      "check-report-exists" as AuditAction,
      {},
      {
        onSuccess: (result) => {
          if (result?.exists !== undefined) {
            setHasReport(result.exists);
          }
        },
      },
    );
  }, []);

  // Handle Esc key to close dialogs
  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (showPdfDialog) setShowPdfDialog(false);
        if (showEraseDialog) setShowEraseDialog(false);
      }
    };

    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [showPdfDialog, showEraseDialog]);

  // Build section options from dropdown options
  const sections: DropdownOption[] = dropdownOptions.map((options, index) => {
    const sectionTitle = Object.keys(options)[0];
    return {
      id: index,
      name: sectionTitle,
    };
  });

  // Update predefined notes when section changes
  useEffect(() => {
    if (selectedSection) {
      const sectionName = selectedSection.name;
      const notesSection = dropdownOptions.find(
        (element) => Object.keys(element)[0] === sectionName,
      );
      if (!notesSection) return;

      const sectionData = (
        notesSection[sectionName as keyof typeof notesSection] as {
          value: string;
        }[]
      ).map((element, index) => ({
        id: index,
        name: element.value,
      }));
      setPredefinedNotes(sectionData);
      setSelectedNote(null);
    }
  }, [selectedSection]);

  // Send request helper
  const sendRequest = useCallback(
    (action: AuditAction, payload: any, handlers: PendingRequest = {}) => {
      const requestId = `audit-${action}-${Date.now()}`;
      pendingRequests.current.set(requestId, handlers);
      postToFigma({
        target: "audit",
        action,
        payload,
        requestId,
      });
      return requestId;
    },
    [],
  );

  // Message handler
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const message = event.data.pluginMessage || event.data;
      if (!message?.requestId) return;

      const handlers = pendingRequests.current.get(message.requestId);
      if (!handlers) return;
      pendingRequests.current.delete(message.requestId);

      if (message.type === "error") {
        handlers.onError?.(message.error ?? "Unknown error");
      } else {
        handlers.onSuccess?.(message.result);
      }
      handlers.onFinally?.();
    };

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, []);

  // Clear messages after delay
  const showStatus = (message: string) => {
    setStatusMessage(message);
    setErrorMessage(null);
    setTimeout(() => setStatusMessage(null), 3000);
  };

  const showError = (message: string) => {
    setErrorMessage(message);
    setStatusMessage(null);
    setTimeout(() => setErrorMessage(null), 3000);
  };

  // Handle adding a severity note
  const handleAddNote = useCallback(
    (severity: SeverityLevel) => {
      if (isProcessing) return;

      setIsProcessing(severity);

      sendRequest(
        "add-note",
        {
          severity,
          title: selectedSection?.name,
          selectedNote: selectedNote?.name,
          note,
        },
        {
          onSuccess: (result) => {
            if (result?.success) {
              showStatus(result.message);
            } else {
              showError(result?.message ?? "Failed to add note");
            }
          },
          onError: showError,
          onFinally: () => setIsProcessing(null),
        },
      );
    },
    [isProcessing, sendRequest, selectedSection, selectedNote, note],
  );

  // Handle quick win
  const handleQuickWin = useCallback(() => {
    if (isProcessing) return;

    setIsProcessing("quick-win");

    sendRequest(
      "add-quick-win",
      {},
      {
        onSuccess: (result) => {
          if (result?.success) {
            showStatus(result.message);
          } else {
            showError(result?.message ?? "Failed to mark as quick win");
          }
        },
        onError: showError,
        onFinally: () => setIsProcessing(null),
      },
    );
  }, [isProcessing, sendRequest]);

  // Handle generate report
  const handleGenerateReport = useCallback(() => {
    if (isProcessing) return;

    setIsProcessing("report");

    sendRequest(
      "generate-report",
      {},
      {
        onSuccess: (result) => {
          if (result?.success) {
            setHasReport(true);
            showStatus(result.message);
          } else {
            showError(result?.message ?? "Failed to generate report");
          }
        },
        onError: showError,
        onFinally: () => setIsProcessing(null),
      },
    );
  }, [isProcessing, sendRequest]);

  // Handle export PDF
  const handleExportPdf = useCallback(() => {
    if (isProcessing) return;

    setIsProcessing("export-pdf");
    setShowPdfDialog(false);

    sendRequest(
      "export-pdf",
      {},
      {
        onSuccess: (result) => {
          if (result?.success && result.data) {
            downloadPdf(new Uint8Array(result.data), "audit-report.pdf");
            showStatus("PDF exported successfully");
          } else {
            showError(result?.message ?? "Failed to export PDF");
          }
        },
        onError: showError,
        onFinally: () => setIsProcessing(null),
      },
    );
  }, [isProcessing, sendRequest]);

  // Handle export multi-page PDF
  const handleExportMultipagePdf = useCallback(() => {
    if (isProcessing) return;

    setIsProcessing("export-multipage-pdf");
    setShowPdfDialog(false);

    sendRequest(
      "export-multipage-pdf",
      {},
      {
        onSuccess: async (result) => {
          if (result?.success && result.pages) {
            const pages = result.pages.map((p: number[]) => new Uint8Array(p));
            await createMultiPagePdf(pages);
            showStatus("Multi-page PDF exported successfully");
          } else {
            showError(result?.message ?? "Failed to export multi-page PDF");
          }
        },
        onError: showError,
        onFinally: () => setIsProcessing(null),
      },
    );
  }, [isProcessing, sendRequest]);

  // Handle export CSV
  const handleExportCsv = useCallback(() => {
    if (isProcessing) return;

    setIsProcessing("export-csv");

    sendRequest(
      "export-csv",
      {},
      {
        onSuccess: (result) => {
          if (result?.success && result.data) {
            exportCsv(result.data as CsvData);
            showStatus("CSV exported successfully");
          } else {
            showError(result?.message ?? "Failed to export CSV");
          }
        },
        onError: showError,
        onFinally: () => setIsProcessing(null),
      },
    );
  }, [isProcessing, sendRequest]);

  // Handle update from canvas
  const handleUpdateFromCanvas = useCallback(() => {
    if (isProcessing) return;

    setIsProcessing("update");

    sendRequest(
      "update-from-canvas",
      {},
      {
        onSuccess: (result) => {
          if (result?.success) {
            showStatus(result.message);
          } else {
            showError(result?.message ?? "Failed to update from canvas");
          }
        },
        onError: showError,
        onFinally: () => setIsProcessing(null),
      },
    );
  }, [isProcessing, sendRequest]);

  // Handle erase notes on canvas
  const handleEraseNotesOnCanvas = useCallback(() => {
    if (isProcessing) return;

    setIsProcessing("erase-notes");

    sendRequest(
      "erase-notes-on-canvas",
      {},
      {
        onSuccess: (result) => {
          if (result?.success) {
            showStatus(result.message);
          } else {
            showError(result?.message ?? "Failed to erase notes");
          }
        },
        onError: showError,
        onFinally: () => setIsProcessing(null),
      },
    );
  }, [isProcessing, sendRequest]);

  // Handle erase report (with confirmation)
  const handleEraseReport = useCallback(() => {
    if (isProcessing) return;

    setIsProcessing("erase-report");
    setShowEraseDialog(false);

    sendRequest(
      "erase-report",
      {},
      {
        onSuccess: (result) => {
          if (result?.success) {
            setHasReport(false);
            showStatus(result.message);
          } else {
            showError(result?.message ?? "Failed to erase report");
          }
        },
        onError: showError,
        onFinally: () => setIsProcessing(null),
      },
    );
  }, [isProcessing, sendRequest]);

  const inputStyle = {
    width: "100%",
  };

  const buttonStyle = (bgColor: string) => ({
    backgroundColor: "#ffffff",
    ["--btnColor" as any]: bgColor,
    border: "var(--pixel-1) solid var(--btnColor)",
    color: "#111827",
  });

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "16px",
        padding: "16px",
      }}
    >
      {/* Status Messages */}
      {(statusMessage || errorMessage) && (
        <div
          className="status-pill pill-anim"
          style={{
            ["--pillBtnColor" as any]: statusMessage ? "#059669" : "#dc2626",
          }}
        >
          {statusMessage || errorMessage}
        </div>
      )}

      {/* Note Input Card */}
      <Card title="Add Note">
        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          <FormControl label="Category">
            <select
              value={selectedSection?.id ?? ""}
              onChange={(e) => {
                if (e.target.value === "") {
                  setSelectedSection(null);
                  setPredefinedNotes([]);
                  setSelectedNote(null);
                  return;
                }

                const id = parseInt(e.target.value, 10);
                const section = sections.find((s) => s.id === id);
                setSelectedSection(section || null);
              }}
              style={inputStyle}
            >
              <option value="">Select category...</option>
              {sections.map((section) => (
                <option key={section.id} value={section.id}>
                  {section.name}
                </option>
              ))}
            </select>
          </FormControl>

          {predefinedNotes.length > 0 && (
            <FormControl label="Predefined Note">
              <select
                value={selectedNote?.id ?? ""}
                onChange={(e) => {
                  const id = parseInt(e.target.value);
                  const noteOption = predefinedNotes.find((n) => n.id === id);
                  setSelectedNote(noteOption || null);
                }}
                style={inputStyle}
              >
                <option value="">Select note...</option>
                {predefinedNotes.map((noteOption) => (
                  <option key={noteOption.id} value={noteOption.id}>
                    {noteOption.name}
                  </option>
                ))}
              </select>
            </FormControl>
          )}

          <FormControl label="Additional Notes">
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Add your custom notes here..."
              style={{
                ...inputStyle,
                minHeight: "80px",
                resize: "vertical",
              }}
            />
          </FormControl>
        </div>
      </Card>

      {/* Severity Buttons Card */}
      <Card title="Severity" className="flex-card severity-card">
        <button
          className="win-button"
          tool-tip="Mark as a quick win"
          onClick={handleQuickWin}
          // disabled={isProcessing !== null}
        >
          {"🏆"}
          {/* {isProcessing === "quick-win" ? "Processing..." : "🏆"} */}
        </button>

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "12px",
          }}
        >
          <div className="flex wrap">
            {SEVERITY_BUTTONS.map(({ severity, label, bgColor }) => (
              <button
                key={severity}
                onClick={() => handleAddNote(severity)}
                // disabled={isProcessing !== null}
                style={{
                  ...buttonStyle(bgColor),
                  // opacity: isProcessing && isProcessing !== severity ? 0.5 : 1,
                }}
              >
                {label}
                {/* {isProcessing === severity ? "..." : label} */}
              </button>
            ))}
          </div>
        </div>
      </Card>

      {/* Report Actions Card */}
      <Card title="Report" className="flex-card">
        <div className="flex">
          <button
            className="secondary"
            onClick={handleGenerateReport}
            disabled={isProcessing !== null}
          >
            {isProcessing === "report" ? "Generating..." : "Generate Report"}
          </button>

          <button
            className="secondary"
            onClick={() => setShowPdfDialog(true)}
            disabled={isProcessing !== null || !hasReport}
            title={!hasReport ? "Generate a report first" : ""}
          >
            Export PDF
          </button>

          <button
            className="secondary"
            onClick={handleExportCsv}
            disabled={isProcessing !== null || !hasReport}
            title={!hasReport ? "Generate a report first" : ""}
          >
            {isProcessing === "export-csv" ? "Exporting..." : "Export CSV"}
          </button>
        </div>
      </Card>

      {/* Cleanup Actions Card */}
      <Card title="Manage" className="flex-card">
        <div className="flex">
          {/* <button
            onClick={handleUpdateFromCanvas}
            disabled={isProcessing !== null}
            style={actionButtonStyle("#800582")}
          >
            {isProcessing === "update" ? "Updating..." : "Update from Canvas ↑"}
          </button> */}

          <button
            onClick={handleEraseNotesOnCanvas}
            disabled={isProcessing !== null}
            className="secondary"
          >
            {isProcessing === "erase-notes"
              ? "Erasing..."
              : "Erase Notes on Canvas"}
          </button>

          <button
            onClick={() => setShowEraseDialog(true)}
            disabled={isProcessing !== null}
            className="secondary"
          >
            {isProcessing === "erase-report"
              ? "Erasing..."
              : "Erase Report Data"}
          </button>
        </div>
      </Card>

      {/* PDF Export Dialog */}
      {showPdfDialog && (
        <div className="dialog" onClick={() => setShowPdfDialog(false)}>
          <div className="inner-dialog" onClick={(e) => e.stopPropagation()}>
            <h3 className="card-title" style={{ margin: "0 0 16px 0" }}>
              Export PDF
            </h3>
            <div
              style={{ display: "flex", flexDirection: "column", gap: "8px" }}
            >
              <button
                onClick={handleExportPdf}
                disabled={isProcessing !== null}
              >
                {isProcessing === "export-pdf"
                  ? "Exporting..."
                  : "Export Single Page"}
              </button>
              <button
                onClick={handleExportMultipagePdf}
                disabled={isProcessing !== null}
              >
                {isProcessing === "export-multipage-pdf"
                  ? "Exporting..."
                  : "Export Multi-Page"}
              </button>
              <button
                onClick={() => setShowPdfDialog(false)}
                disabled={isProcessing !== null}
                className="secondary"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Erase Report Confirmation Dialog */}
      {showEraseDialog && (
        <div className="dialog" onClick={() => setShowEraseDialog(false)}>
          <div className="inner-dialog" onClick={(e) => e.stopPropagation()}>
            <h3 className="card-title" style={{ margin: "0 0 16px 0" }}>
              Confirm Erase
            </h3>
            <p style={{ margin: "0 0 16px 0", fontSize: "14px" }}>
              Are you sure you want to erase all report data? This action cannot
              be undone.
            </p>
            <div
              style={{ display: "flex", flexDirection: "column", gap: "8px" }}
            >
              <button
                onClick={handleEraseReport}
                disabled={isProcessing !== null}
              >
                {isProcessing === "erase-report" ? "Erasing..." : "OK"}
              </button>
              <button
                onClick={() => setShowEraseDialog(false)}
                disabled={isProcessing !== null}
                className="secondary"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
