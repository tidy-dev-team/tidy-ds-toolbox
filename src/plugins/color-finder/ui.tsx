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
  ImageExport,
  PaletteColor,
  PaletteSummary,
  RenderPalettePageResult,
} from "./types";
import { serializeInventoryToMarkdown } from "./utils/markdown";
import { robustExtractWithSummary } from "./utils/extract";

type ScanMode = "vector" | "image-palette";

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
    // ignore
  }
  document.body.removeChild(textarea);
}

const DEFAULT_OPTIONS: ScanOptions = {
  includeBackgrounds: true,
  includeText: true,
  includeBorders: true,
  includeIcons: true,
  skipTokenized: false,
  lookInsideInstances: true,
  sortByHue: false,
};

interface VectorProgress {
  pagesScanned: number;
  totalPages: number;
  nodesScanned: number;
}

interface ImageProgress {
  phase: "exporting" | "sampling";
  pagesScanned: number;
  totalPages: number;
  imagesExported: number;
  totalImages: number;
}

interface PalettePageResult {
  pageId: string;
  pageName: string;
  palette: PaletteColor[];
  summary: PaletteSummary;
}

export function TidyColorFinderUI() {
  const [pages, setPages] = useState<PageInfo[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [scopeMode, setScopeMode] = useState<ScopeMode>("current-page");
  const [options, setOptions] = useState<ScanOptions>(DEFAULT_OPTIONS);
  const [scanning, setScanning] = useState(false);
  const [vectorProgress, setVectorProgress] = useState<VectorProgress | null>(
    null,
  );
  const [imageProgress, setImageProgress] = useState<ImageProgress | null>(
    null,
  );
  const [scanResult, setScanResult] = useState<ScanColorsResult | null>(null);
  const [paletteResult, setPaletteResult] = useState<PalettePageResult | null>(
    null,
  );
  const [copied, setCopied] = useState(false);
  const [mode, setMode] = useState<ScanMode>("vector");
  const lastClickedIndex = useRef<number | null>(null);

  useEffect(() => {
    postToFigma({
      target: "color-finder",
      action: "list-pages",
      payload: {},
      requestId: "list-pages",
    });
  }, []);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const message = event.data.pluginMessage || event.data;
      if (!message) return;

      if (message.type === "progress") {
        const p = message.payload;
        if (p && "phase" in p) {
          setImageProgress(p as ImageProgress);
        } else {
          setVectorProgress(p as VectorProgress);
        }
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
        setScanResult(message.result as ScanColorsResult);
        setScanning(false);
        setVectorProgress(null);
      } else if (
        message.type === "response" &&
        message.requestId === "scan-image-palette"
      ) {
        const result = message.result as {
          images: ImageExport[];
          skipped: number;
          scopeLabel: string;
          pagesScanned: number;
          totalPages: number;
        };
        processImagePalette(result.images, result.skipped, result.scopeLabel);
      } else if (
        message.type === "response" &&
        message.requestId === "render-palette-page"
      ) {
        const renderResult = message.result as RenderPalettePageResult;
        if (paletteResult) {
          setPaletteResult((prev) =>
            prev
              ? {
                  ...prev,
                  pageId: renderResult.pageId,
                  pageName: renderResult.pageName,
                }
              : prev,
          );
        }
        setScanning(false);
        setImageProgress(null);
      } else if (message.type === "error") {
        setScanning(false);
        setVectorProgress(null);
        setImageProgress(null);
      }
    };
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [paletteResult]);

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

  const handleVectorScan = useCallback(() => {
    setScanning(true);
    setScanResult(null);
    setPaletteResult(null);
    setVectorProgress(null);
    postToFigma({
      target: "color-finder",
      action: "scan-colors",
      payload: {
        scope: {
          mode: scopeMode,
          pageIds:
            scopeMode === "selected-pages" ? [...selectedIds] : undefined,
        },
        options,
      },
      requestId: "scan-colors",
    });
  }, [scopeMode, selectedIds, options]);

  const handleImageScan = useCallback(() => {
    setScanning(true);
    setScanResult(null);
    setPaletteResult(null);
    setImageProgress(null);
    postToFigma({
      target: "color-finder",
      action: "scan-image-palette",
      payload: {
        scope: {
          mode: scopeMode,
          pageIds:
            scopeMode === "selected-pages" ? [...selectedIds] : undefined,
        },
      },
      requestId: "scan-image-palette",
    });
  }, [scopeMode, selectedIds]);

  const processImagePalette = useCallback(
    async (images: ImageExport[], skipped: number, scopeLabel: string) => {
      setImageProgress({
        phase: "sampling",
        pagesScanned: 0,
        totalPages: 0,
        imagesExported: images.length,
        totalImages: images.length,
      });

      const pixelData: {
        pixels: Uint8ClampedArray;
        width: number;
        height: number;
        source: ImageExport["source"];
        imageId: string;
      }[] = [];

      for (let i = 0; i < images.length; i++) {
        const img = images[i];
        try {
          const decoded = await decodePng(img.pngBytes);
          pixelData.push({
            pixels: decoded.pixels,
            width: decoded.width,
            height: decoded.height,
            source: img.source,
            imageId: img.imageId,
          });
        } catch {
          // skip images that fail to decode
        }

        setImageProgress({
          phase: "sampling",
          pagesScanned: 0,
          totalPages: 0,
          imagesExported: i + 1,
          totalImages: images.length,
        });
      }

      const extraction = robustExtractWithSummary(pixelData);

      const summary: PaletteSummary = {
        // Total images that decoded and were sampled (contributed + masked),
        // so "N images scanned �· M masked" reads consistently (M ⊆ N).
        imagesScanned:
          extraction.summary.imagesContributed +
          extraction.summary.imagesMasked,
        photosMasked: extraction.summary.imagesMasked,
        nodesDetected: images.length + skipped,
      };

      const pageResult: PalettePageResult = {
        pageId: "",
        pageName: "",
        palette: extraction.palette,
        summary,
      };
      setPaletteResult(pageResult);

      postToFigma({
        target: "color-finder",
        action: "render-palette-page",
        payload: { palette: extraction.palette, summary, scopeLabel },
        requestId: "render-palette-page",
      });
    },
    [],
  );

  const handleRun = useCallback(() => {
    if (mode === "vector") {
      handleVectorScan();
    } else {
      handleImageScan();
    }
  }, [mode, handleVectorScan, handleImageScan]);

  const handleShowPage = useCallback(() => {
    const pageId = scanResult?.pageId || paletteResult?.pageId;
    if (!pageId) return;
    postToFigma({
      target: "color-finder",
      action: "show-page",
      payload: { pageId },
    });
  }, [scanResult, paletteResult]);

  const handleCopyMarkdown = useCallback(() => {
    if (!scanResult) return;
    copyToClipboard(serializeInventoryToMarkdown(scanResult.inventory));
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }, [scanResult]);

  const imageScanDisabled =
    scanning || (scopeMode === "selected-pages" && selectedIds.size === 0);

  const vectorScanDisabled =
    scanning ||
    (scopeMode === "selected-pages" && selectedIds.size === 0) ||
    (!options.includeBackgrounds &&
      !options.includeText &&
      !options.includeBorders &&
      !options.includeIcons);

  const scanDisabled =
    mode === "vector" ? vectorScanDisabled : imageScanDisabled;

  const showPageId = scanResult?.pageId || paletteResult?.pageId;
  const showPageName = scanResult?.pageName || paletteResult?.pageName || "";

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "var(--pixel-16, 16px)",
        padding: "var(--pixel-16, 16px)",
      }}
    >
      <Card title="Mode">
        <div style={{ display: "flex", gap: 8 }}>
          <QuickButton
            label="From elements"
            active={mode === "vector"}
            onClick={() => setMode("vector")}
          />
          <QuickButton
            label="From images"
            active={mode === "image-palette"}
            onClick={() => setMode("image-palette")}
          />
        </div>
      </Card>

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
                    style={{
                      marginLeft: "auto",
                      fontSize: 11,
                      color: "var(--disabled-color)",
                    }}
                  >
                    current
                  </span>
                )}
              </label>
            ))}
          </div>
          <div style={{ fontSize: 11, color: "var(--disabled-color)" }}>
            Tick pages (shift-click for a range) to use "Selected pages".
          </div>
        </div>
      </Card>

      {mode === "vector" && (
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
            <hr
              style={{
                border: 0,
                borderTop: "1px solid var(--border-light)",
                margin: "2px 0",
              }}
            />
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
            <hr
              style={{
                border: 0,
                borderTop: "1px solid var(--border-light)",
                margin: "2px 0",
              }}
            />
            <CheckRow
              label="Sort each table by hue (instead of usage count)"
              checked={options.sortByHue ?? false}
              onChange={(v) => setOptions((o) => ({ ...o, sortByHue: v }))}
            />
          </div>
        </Card>
      )}

      <button
        onClick={handleRun}
        disabled={scanDisabled}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 8,
        }}
      >
        <IconRefresh size={16} stroke={1.5} />
        {scanning ? "Scanning..." : "Run"}
      </button>

      {vectorProgress && (
        <div className="status-message">
          Scanning {vectorProgress.totalPages} page
          {vectorProgress.totalPages === 1 ? "" : "s"} �·{" "}
          {vectorProgress.nodesScanned.toLocaleString()} nodes
        </div>
      )}

      {imageProgress && (
        <div className="status-message">
          {imageProgress.phase === "exporting"
            ? `Exporting images... ${imageProgress.imagesExported} of ${imageProgress.totalImages}`
            : `Sampling images... ${imageProgress.imagesExported} of ${imageProgress.totalImages}`}
        </div>
      )}

      {scanResult && (
        <div className="status-message success">
          <div style={{ marginBottom: 8 }}>
            {scanResult.inventory.summary.uniqueTotal} unique color
            {scanResult.inventory.summary.uniqueTotal === 1 ? "" : "s"} —{" "}
            {scanResult.inventory.summary.byRole.background} background,{" "}
            {scanResult.inventory.summary.byRole.text} text,{" "}
            {scanResult.inventory.summary.byRole.border} border,{" "}
            {scanResult.inventory.summary.byRole.icon} icon;{" "}
            {scanResult.inventory.summary.untokenized} untokenized
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
              Open "{scanResult.pageName}"
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

      {paletteResult && (
        <div className="status-message success">
          <div style={{ marginBottom: 8 }}>
            {paletteResult.palette.length} unique color
            {paletteResult.palette.length === 1 ? "" : "s"} ·{" "}
            {paletteResult.summary.imagesScanned} image
            {paletteResult.summary.imagesScanned === 1 ? "" : "s"} scanned
            {paletteResult.summary.photosMasked > 0
              ? ` · ${paletteResult.summary.photosMasked} photo image${paletteResult.summary.photosMasked === 1 ? "" : "s"} masked`
              : ""}
            {paletteResult.summary.nodesDetected > 0
              ? ` · ${paletteResult.summary.nodesDetected} node${paletteResult.summary.nodesDetected === 1 ? "" : "s"} detected`
              : ""}
          </div>
          {showPageId && (
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
              Open "{showPageName}"
            </button>
          )}
        </div>
      )}
    </div>
  );
}

async function decodePng(bytes: Uint8Array): Promise<{
  pixels: Uint8ClampedArray;
  width: number;
  height: number;
}> {
  // Cast: exportAsync yields a backing ArrayBuffer at runtime, but its static
  // type (Uint8Array<ArrayBufferLike>) is not assignable to BlobPart under the
  // stricter typed-array generics.
  const blob = new Blob([bytes as BlobPart], { type: "image/png" });
  const bitmap = await createImageBitmap(blob);
  try {
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Failed to get 2d context");
    ctx.drawImage(bitmap, 0, 0);
    const imageData = ctx.getImageData(0, 0, bitmap.width, bitmap.height);
    return {
      pixels: imageData.data,
      width: bitmap.width,
      height: bitmap.height,
    };
  } finally {
    bitmap.close();
  }
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
