import { useCallback, useEffect, useRef, useState } from "react";
import { Card } from "@shell/components";
import { postToFigma } from "@shared/bridge";
import {
  IconRefresh,
  IconExternalLink,
  IconClipboard,
  IconCheck,
} from "@tabler/icons-react";
import {
  PageInfo,
  ScanColorsResult,
  ScanOptions,
  ScopeMode,
} from "./types";
import { serializeInventoryToMarkdown } from "./utils/markdown";

// Copy text to the clipboard from the Figma plugin iframe. navigator.clipboard
// is unreliable inside the sandboxed iframe, so fall back to execCommand.
function copyToClipboard(text: string): void {
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();
  try {
    document.execCommand("copy");
  } catch {
    // ignore — best effort
  }
  document.body.removeChild(textarea);
}

const DEFAULT_OPTIONS: ScanOptions = {
  includeBackgrounds: true,
  includeText: true,
  includeBorders: true,
  includeIcons: true,
  skipTokenized: false,
  // On by default: most real text/icon colors live inside component instances,
  // so off-by-default makes the Text table miss almost everything. Turn off to
  // count design-level usage only.
  lookInsideInstances: true,
  sortByHue: false,
};

interface Progress {
  pagesScanned: number;
  totalPages: number;
  nodesScanned: number;
}

export function TidyColorFinderUI() {
  const [pages, setPages] = useState<PageInfo[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [scopeMode, setScopeMode] = useState<ScopeMode>("current-page");
  const [options, setOptions] = useState<ScanOptions>(DEFAULT_OPTIONS);
  const [scanning, setScanning] = useState(false);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [result, setResult] = useState<ScanColorsResult | null>(null);
  const [copied, setCopied] = useState(false);
  const lastClickedIndex = useRef<number | null>(null);

  // Load pages on mount.
  useEffect(() => {
    postToFigma({
      target: "color-finder",
      action: "list-pages",
      payload: {},
      requestId: "list-pages",
    });
  }, []);

  // Listen for responses + progress.
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const message = event.data.pluginMessage || event.data;
      if (!message) return;

      if (message.type === "progress") {
        setProgress(message.payload as Progress);
      } else if (
        message.type === "response" &&
        message.requestId === "list-pages"
      ) {
        const pageList = (message.result?.pages ?? []) as PageInfo[];
        setPages(pageList);
        const current = pageList.find((p) => p.isCurrent);
        if (current) setSelectedIds(new Set([current.id]));
      } else if (
        message.type === "response" &&
        message.requestId === "scan-colors"
      ) {
        setResult(message.result as ScanColorsResult);
        setScanning(false);
        setProgress(null);
      } else if (message.type === "error") {
        setScanning(false);
        setProgress(null);
      }
    };
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, []);

  const togglePage = useCallback(
    (index: number, shiftKey: boolean) => {
      setScopeMode("selected-pages");
      setSelectedIds((prev) => {
        const next = new Set(prev);
        if (shiftKey && lastClickedIndex.current !== null) {
          const [from, to] = [lastClickedIndex.current, index].sort(
            (a, b) => a - b,
          );
          for (let i = from; i <= to; i++) next.add(pages[i].id);
        } else {
          const id = pages[index].id;
          if (next.has(id)) next.delete(id);
          else next.add(id);
        }
        return next;
      });
      lastClickedIndex.current = index;
    },
    [pages],
  );

  const handleScan = useCallback(() => {
    setScanning(true);
    setResult(null);
    setProgress(null);
    postToFigma({
      target: "color-finder",
      action: "scan-colors",
      payload: {
        scope: {
          mode: scopeMode,
          pageIds: scopeMode === "selected-pages" ? [...selectedIds] : undefined,
        },
        options,
      },
      requestId: "scan-colors",
    });
  }, [scopeMode, selectedIds, options]);

  const handleShowPage = useCallback(() => {
    if (!result) return;
    postToFigma({
      target: "color-finder",
      action: "show-page",
      payload: { pageId: result.pageId },
    });
  }, [result]);

  const handleCopyMarkdown = useCallback(() => {
    if (!result) return;
    copyToClipboard(serializeInventoryToMarkdown(result.inventory));
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }, [result]);

  const scanDisabled =
    scanning ||
    (scopeMode === "selected-pages" && selectedIds.size === 0) ||
    (!options.includeBackgrounds &&
      !options.includeText &&
      !options.includeBorders &&
      !options.includeIcons);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "var(--pixel-16, 16px)",
        padding: "var(--pixel-16, 16px)",
      }}
    >
      <Card title="Scope">
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <QuickButton
              label="Current page"
              active={scopeMode === "current-page"}
              onClick={() => setScopeMode("current-page")}
            />
            <QuickButton
              label="Selected pages"
              active={scopeMode === "selected-pages"}
              onClick={() => setScopeMode("selected-pages")}
            />
            <QuickButton
              label="All pages"
              active={scopeMode === "all-pages"}
              onClick={() => setScopeMode("all-pages")}
            />
            <QuickButton
              label="Current selection"
              active={scopeMode === "current-selection"}
              onClick={() => setScopeMode("current-selection")}
            />
          </div>

          <div
            style={{
              border: "1px solid var(--border-light)",
              borderRadius: "var(--pixel-6, 6px)",
              maxHeight: 180,
              overflowY: "auto",
              opacity: scopeMode === "selected-pages" ? 1 : 0.55,
            }}
          >
            {pages.map((page, index) => (
              <label
                key={page.id}
                onClick={(e) => {
                  e.preventDefault();
                  togglePage(index, e.shiftKey);
                }}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "6px 10px",
                  fontSize: 13,
                  cursor: "pointer",
                  borderBottom: "1px solid var(--border-light)",
                  userSelect: "none",
                }}
              >
                <input
                  type="checkbox"
                  readOnly
                  checked={selectedIds.has(page.id)}
                />
                <span>{page.name}</span>
                {page.isCurrent && (
                  <span
                    style={{ marginLeft: "auto", fontSize: 11, color: "var(--disabled-color)" }}
                  >
                    current
                  </span>
                )}
              </label>
            ))}
          </div>
          <div style={{ fontSize: 11, color: "var(--disabled-color)" }}>
            Tick pages (shift-click for a range) to use “Selected pages”.
          </div>
        </div>
      </Card>

      <Card title="Options">
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <CheckRow
            label="Backgrounds"
            checked={options.includeBackgrounds}
            onChange={(v) =>
              setOptions((o) => ({ ...o, includeBackgrounds: v }))
            }
          />
          <CheckRow
            label="Text"
            checked={options.includeText}
            onChange={(v) => setOptions((o) => ({ ...o, includeText: v }))}
          />
          <CheckRow
            label="Borders"
            checked={options.includeBorders}
            onChange={(v) => setOptions((o) => ({ ...o, includeBorders: v }))}
          />
          <CheckRow
            label="Icons (by layer name)"
            checked={options.includeIcons}
            onChange={(v) => setOptions((o) => ({ ...o, includeIcons: v }))}
          />
          <hr style={{ border: 0, borderTop: "1px solid var(--border-light)", margin: "2px 0" }} />
          <CheckRow
            label="Skip colors already bound to a variable"
            checked={options.skipTokenized}
            onChange={(v) => setOptions((o) => ({ ...o, skipTokenized: v }))}
          />
          <CheckRow
            label="Look inside component instances"
            checked={options.lookInsideInstances}
            onChange={(v) =>
              setOptions((o) => ({ ...o, lookInsideInstances: v }))
            }
          />
          <hr style={{ border: 0, borderTop: "1px solid var(--border-light)", margin: "2px 0" }} />
          <CheckRow
            label="Sort each table by hue (instead of usage count)"
            checked={options.sortByHue ?? false}
            onChange={(v) => setOptions((o) => ({ ...o, sortByHue: v }))}
          />
        </div>
      </Card>

      <button
        onClick={handleScan}
        disabled={scanDisabled}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 8,
        }}
      >
        <IconRefresh size={16} stroke={1.5} />
        {scanning ? "Scanning…" : "Run"}
      </button>

      {progress && (
        <div className="status-message">
          Scanning {progress.totalPages} page
          {progress.totalPages === 1 ? "" : "s"} ·{" "}
          {progress.nodesScanned.toLocaleString()} nodes
        </div>
      )}

      {result && (
        <div className="status-message success">
          <div style={{ marginBottom: 8 }}>
            {result.inventory.summary.uniqueTotal} unique color
            {result.inventory.summary.uniqueTotal === 1 ? "" : "s"} —{" "}
            {result.inventory.summary.byRole.background} background,{" "}
            {result.inventory.summary.byRole.text} text,{" "}
            {result.inventory.summary.byRole.border} border,{" "}
            {result.inventory.summary.byRole.icon} icon;{" "}
            {result.inventory.summary.untokenized} untokenized
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button
              className="secondary"
              onClick={handleShowPage}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: "6px 10px",
                fontSize: 12,
              }}
            >
              <IconExternalLink size={14} stroke={1.5} />
              Open “{result.pageName}”
            </button>
            <button
              className="secondary"
              onClick={handleCopyMarkdown}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: "6px 10px",
                fontSize: 12,
              }}
            >
              {copied ? (
                <IconCheck size={14} stroke={1.5} />
              ) : (
                <IconClipboard size={14} stroke={1.5} />
              )}
              {copied ? "Copied" : "Copy as markdown"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function QuickButton({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      className={active ? "" : "secondary"}
      onClick={onClick}
      style={{ padding: "6px 10px", fontSize: 12 }}
    >
      {label}
    </button>
  );
}

function CheckRow({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        fontSize: 13,
        cursor: "pointer",
      }}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      {label}
    </label>
  );
}
