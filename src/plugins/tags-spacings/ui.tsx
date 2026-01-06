import { useState, useCallback, useEffect, useRef } from "react";
import { Card, FormControl } from "@shell/components";
import { postToFigma } from "@shared/bridge";
import {
  TagsConfig,
  SpacingsConfig,
  TagDirection,
  IndexingScheme,
  SpacingUnits,
} from "./types";
import {
  DEFAULT_TAGS_CONFIG,
  DEFAULT_SPACINGS_CONFIG,
} from "./utils/constants";
import { IconTag, IconRulerMeasure2, IconTools } from "@tabler/icons-react";

interface PendingRequest {
  onSuccess?: (result: any) => void;
  onError?: (error: string) => void;
  onFinally?: () => void;
}

const TAG_DIRECTIONS: { value: TagDirection; label: string }[] = [
  { value: "auto", label: "Auto (Smart placement)" },
  { value: "top", label: "Top" },
  { value: "right", label: "Right" },
  { value: "bottom", label: "Bottom" },
  { value: "left", label: "Left" },
];

const INDEXING_SCHEMES: { value: IndexingScheme; label: string }[] = [
  { value: "alphabetic", label: "Alphabetic (a, b, c...)" },
  { value: "numeric", label: "Numeric (1, 2, 3...)" },
  { value: "geometric", label: "Geometric (●, ■, ▲...)" },
  { value: "circled", label: "Circled (①, ②, ③...)" },
  { value: "extended", label: "Extended (a-z, 0-9, symbols)" },
];

const SPACING_UNITS: { value: SpacingUnits; label: string }[] = [
  { value: "px", label: "Pixels (px)" },
  { value: "rem", label: "Rem" },
  { value: "percent", label: "Percent (%)" },
  { value: "var", label: "CSS Variables" },
];

export function TagsSpacingsUI() {
  // Tags state
  const [tagDirection, setTagDirection] = useState<TagDirection>(
    DEFAULT_TAGS_CONFIG.tagDirection,
  );
  const [indexingScheme, setIndexingScheme] = useState<IndexingScheme>(
    DEFAULT_TAGS_CONFIG.indexingScheme,
  );
  const [startIndex, setStartIndex] = useState<string>(
    DEFAULT_TAGS_CONFIG.startIndex,
  );
  const [includeInstances, setIncludeInstances] = useState<boolean>(
    DEFAULT_TAGS_CONFIG.includeInstances,
  );
  const [includeText, setIncludeText] = useState<boolean>(
    DEFAULT_TAGS_CONFIG.includeText,
  );

  // Spacings state
  const [includeSize, setIncludeSize] = useState<boolean>(
    DEFAULT_SPACINGS_CONFIG.includeSize,
  );
  const [includePaddings, setIncludePaddings] = useState<boolean>(
    DEFAULT_SPACINGS_CONFIG.includePaddings,
  );
  const [includeItemSpacing, setIncludeItemSpacing] = useState<boolean>(
    DEFAULT_SPACINGS_CONFIG.includeItemSpacing,
  );
  const [units, setUnits] = useState<SpacingUnits>(
    DEFAULT_SPACINGS_CONFIG.units,
  );
  const [rootSize, setRootSize] = useState<number>(
    DEFAULT_SPACINGS_CONFIG.rootSize,
  );

  // UI state
  const [isRunning, setIsRunning] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Internal tools state
  const [toolsExists, setToolsExists] = useState<boolean>(false);
  const [toolsComponentCount, setToolsComponentCount] = useState<number>(0);

  const pendingRequests = useRef(new Map<string, PendingRequest>());

  const sendRequest = useCallback(
    (action: string, payload: any, handlers: PendingRequest = {}) => {
      const requestId = `tags-spacings-${action}-${Date.now()}`;
      pendingRequests.current.set(requestId, handlers);
      postToFigma({
        target: "tags-spacings",
        action,
        payload,
        requestId,
      });
      return requestId;
    },
    [],
  );

  // Initialize and listen for messages
  useEffect(() => {
    // Request initial state
    sendRequest("init", {});
    sendRequest("selection-change", {});
    sendRequest("check-internal-tools", {});

    const handleMessage = (event: MessageEvent) => {
      const message = event.data.pluginMessage || event.data;
      if (!message) return;

      // Handle request responses
      if (message.requestId) {
        const handlers = pendingRequests.current.get(message.requestId);
        if (handlers) {
          pendingRequests.current.delete(message.requestId);
          if (message.type === "error") {
            handlers.onError?.(message.error ?? "Unknown error");
          } else {
            handlers.onSuccess?.(message.result);
          }
          handlers.onFinally?.();
        }
      }

      // Handle specific message types
      if (message.type === "settings") {
        const settings = message.payload;
        if (settings?.tags) {
          setTagDirection(
            settings.tags.tagDirection ?? DEFAULT_TAGS_CONFIG.tagDirection,
          );
          setIndexingScheme(
            settings.tags.indexingScheme ?? DEFAULT_TAGS_CONFIG.indexingScheme,
          );
          setStartIndex(
            settings.tags.startIndex ?? DEFAULT_TAGS_CONFIG.startIndex,
          );
          setIncludeInstances(
            settings.tags.includeInstances ??
              DEFAULT_TAGS_CONFIG.includeInstances,
          );
          setIncludeText(
            settings.tags.includeText ?? DEFAULT_TAGS_CONFIG.includeText,
          );
        }
        if (settings?.spacings) {
          setIncludeSize(
            settings.spacings.includeSize ??
              DEFAULT_SPACINGS_CONFIG.includeSize,
          );
          setIncludePaddings(
            settings.spacings.includePaddings ??
              DEFAULT_SPACINGS_CONFIG.includePaddings,
          );
          setIncludeItemSpacing(
            settings.spacings.includeItemSpacing ??
              DEFAULT_SPACINGS_CONFIG.includeItemSpacing,
          );
          setUnits(settings.spacings.units ?? DEFAULT_SPACINGS_CONFIG.units);
          setRootSize(
            settings.spacings.rootSize ?? DEFAULT_SPACINGS_CONFIG.rootSize,
          );
        }
      } else if (message.type === "internal-tools-status") {
        setToolsExists(message.payload.exists);
        setToolsComponentCount(message.payload.componentCount);
      }
    };

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [sendRequest]);

  // Build tags handler
  const handleBuildTags = useCallback(() => {
    if (isRunning) return;

    const config: TagsConfig = {
      tagDirection,
      indexingScheme,
      startIndex,
      includeInstances,
      includeText,
    };

    setIsRunning("tags");
    setStatusMessage(null);
    setErrorMessage(null);

    sendRequest(
      "build-tags",
      { config },
      {
        onSuccess: (result) => {
          if (result?.success) {
            setStatusMessage(result.message);
          } else {
            setErrorMessage(result?.message ?? "Failed to build tags");
          }
        },
        onError: (error) => {
          setErrorMessage(error);
        },
        onFinally: () => setIsRunning(null),
      },
    );
  }, [
    isRunning,
    tagDirection,
    indexingScheme,
    startIndex,
    includeInstances,
    includeText,
    sendRequest,
  ]);

  // Build spacings handler
  const handleBuildSpacings = useCallback(() => {
    if (isRunning) return;

    const config: SpacingsConfig = {
      includeSize,
      includePaddings,
      includeItemSpacing,
      units,
      rootSize,
      isShallow: true,
    };

    setIsRunning("spacings");
    setStatusMessage(null);
    setErrorMessage(null);

    sendRequest(
      "build-spacings",
      { config },
      {
        onSuccess: (result) => {
          if (result?.success) {
            setStatusMessage(result.message);
          } else {
            setErrorMessage(result?.message ?? "Failed to build spacing marks");
          }
        },
        onError: (error) => {
          setErrorMessage(error);
        },
        onFinally: () => setIsRunning(null),
      },
    );
  }, [
    isRunning,
    includeSize,
    includePaddings,
    includeItemSpacing,
    units,
    rootSize,
    sendRequest,
  ]);

  // Build internal tools handler
  const handleBuildInternalTools = useCallback(() => {
    if (isRunning) return;

    setIsRunning("tools");
    setStatusMessage(null);
    setErrorMessage(null);

    sendRequest(
      "build-internal-tools",
      {},
      {
        onSuccess: (result) => {
          if (result?.success) {
            setStatusMessage(result.message);
            setToolsExists(true);
            setToolsComponentCount(result.componentCount || 0);
          } else {
            setErrorMessage(
              result?.message ?? "Failed to build internal tools",
            );
          }
        },
        onError: (error) => {
          setErrorMessage(error);
        },
        onFinally: () => setIsRunning(null),
      },
    );
  }, [isRunning, sendRequest]);

  // Delete internal tools handler
  const handleDeleteInternalTools = useCallback(() => {
    if (isRunning || !toolsExists) return;

    setIsRunning("tools");
    setStatusMessage(null);
    setErrorMessage(null);

    sendRequest(
      "delete-internal-tools",
      {},
      {
        onSuccess: (result) => {
          if (result?.success) {
            setStatusMessage(result.message);
            setToolsExists(false);
            setToolsComponentCount(0);
          } else {
            setErrorMessage(
              result?.message ?? "Failed to delete internal tools",
            );
          }
        },
        onError: (error) => {
          setErrorMessage(error);
        },
        onFinally: () => setIsRunning(null),
      },
    );
  }, [isRunning, toolsExists, sendRequest]);

  const selectStyle = {
    width: "100%",
    padding: "var(--pixel-8, 8px) var(--pixel-12, 12px)",
    border: "var(--pixel-1, 1px) solid var(--border-light)",
    borderRadius: "var(--pixel-6, 6px)",
    fontSize: "13px",
    backgroundColor: "var(--light-color)",
  };

  const inputStyle = {
    width: "100%",
    padding: "var(--pixel-8, 8px) var(--pixel-12, 12px)",
    border: "var(--pixel-1, 1px) solid var(--border-light)",
    borderRadius: "var(--pixel-6, 6px)",
    fontSize: "13px",
  };

  const checkboxLabelStyle = {
    display: "flex",
    alignItems: "center",
    gap: "var(--pixel-8, 8px)",
    fontSize: "13px",
    cursor: "pointer",
  };

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "var(--pixel-16, 16px)",
        padding: "var(--pixel-16, 16px)",
      }}
    >
      {/* Tags Section */}
      <Card title="Tags (Anatomy)">
        <IconTag className="card-icon" />
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "var(--pixel-16, 16px)",
          }}
        >
          <FormControl label="Tag Position">
            <select
              value={tagDirection}
              onChange={(e) => setTagDirection(e.target.value as TagDirection)}
              style={selectStyle}
            >
              {TAG_DIRECTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </FormControl>

          <FormControl label="Index Style">
            <select
              value={indexingScheme}
              onChange={(e) =>
                setIndexingScheme(e.target.value as IndexingScheme)
              }
              style={selectStyle}
            >
              {INDEXING_SCHEMES.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </FormControl>

          <FormControl label="Start Index">
            <input
              type="text"
              value={startIndex}
              onChange={(e) => setStartIndex(e.target.value.slice(0, 1))}
              maxLength={1}
              style={{ ...inputStyle, width: "60px" }}
            />
          </FormControl>

          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "var(--pixel-8, 8px)",
            }}
          >
            <span style={{ fontSize: "12px", fontWeight: 500 }}>
              Tag Elements:
            </span>
            <label style={checkboxLabelStyle}>
              <input
                type="checkbox"
                checked={includeInstances}
                onChange={(e) => setIncludeInstances(e.target.checked)}
              />
              Instances (components)
            </label>
            <label style={checkboxLabelStyle}>
              <input
                type="checkbox"
                checked={includeText}
                onChange={(e) => setIncludeText(e.target.checked)}
              />
              Text elements
            </label>
          </div>

          <button
            onClick={handleBuildTags}
            disabled={isRunning !== null || (!includeInstances && !includeText)}
            className="morePadding"
            style={{
              opacity: isRunning !== null ? 0.5 : 1,
            }}
          >
            {isRunning === "tags" ? "Building..." : "Build Tags"}
          </button>
        </div>
      </Card>

      {/* Spacings Section */}
      <Card title="Spacing Marks">
        <IconRulerMeasure2 className="card-icon" />
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "var(--pixel-16, 16px)",
          }}
        >
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "var(--pixel-8, 8px)",
            }}
          >
            <span style={{ fontSize: "12px", fontWeight: 500 }}>
              Include Marks For:
            </span>
            <label style={checkboxLabelStyle}>
              <input
                type="checkbox"
                checked={includeSize}
                onChange={(e) => setIncludeSize(e.target.checked)}
              />
              Frame Size (width & height)
            </label>
            <label style={checkboxLabelStyle}>
              <input
                type="checkbox"
                checked={includePaddings}
                onChange={(e) => setIncludePaddings(e.target.checked)}
              />
              Paddings
            </label>
            <label style={checkboxLabelStyle}>
              <input
                type="checkbox"
                checked={includeItemSpacing}
                onChange={(e) => setIncludeItemSpacing(e.target.checked)}
              />
              Item Spacing (gaps)
            </label>
          </div>

          <FormControl label="Units">
            <select
              value={units}
              onChange={(e) => setUnits(e.target.value as SpacingUnits)}
              style={selectStyle}
            >
              {SPACING_UNITS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </FormControl>

          {units === "rem" && (
            <FormControl label="Root Size (px)">
              <input
                type="number"
                value={rootSize}
                onChange={(e) => setRootSize(Number(e.target.value) || 16)}
                min={1}
                style={{ ...inputStyle, width: "80px" }}
              />
            </FormControl>
          )}

          <button
            onClick={handleBuildSpacings}
            disabled={
              isRunning !== null ||
              (!includeSize && !includePaddings && !includeItemSpacing)
            }
            className="morePadding"
            style={{
              opacity: isRunning !== null ? 0.5 : 1,
            }}
          >
            {isRunning === "spacings" ? "Building..." : "Build Spacing Marks"}
          </button>
        </div>
      </Card>

      {/* Internal Tools Section */}
      <Card title="Internal Tools">
        <IconTools className="card-icon" />
        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          <div style={{ fontSize: "12px", color: "#666" }}>
            {toolsExists
              ? `✓ Internal tools page exists (${toolsComponentCount} components)`
              : "⚠️ Internal tools page not found - build required"}
          </div>
          <button
            onClick={handleBuildInternalTools}
            disabled={isRunning !== null}
            style={{
              padding: "10px 16px",
              borderRadius: "6px",
              backgroundColor: "#7E41D9",
              color: "white",
              border: "none",
              cursor: isRunning !== null ? "not-allowed" : "pointer",
              opacity: isRunning !== null ? 0.5 : 1,
            }}
          >
            {isRunning === "tools" ? "Building..." : "Build Internal Tools"}
          </button>
          <button
            onClick={handleDeleteInternalTools}
            disabled={isRunning !== null || !toolsExists}
            style={{
              padding: "10px 16px",
              borderRadius: "6px",
              backgroundColor: "#DC2626",
              color: "white",
              border: "none",
              cursor:
                isRunning !== null || !toolsExists ? "not-allowed" : "pointer",
              opacity: isRunning !== null || !toolsExists ? 0.5 : 1,
            }}
          >
            Delete Internal Tools
          </button>
        </div>
      </Card>

      {/* Status Messages */}
      {(statusMessage || errorMessage) && (
        <div
          style={{
            padding: "var(--pixel-12, 12px)",
            borderRadius: "var(--pixel-8, 8px)",
            fontSize: "12px",
            backgroundColor: statusMessage
              ? "rgba(5, 150, 105, 0.1)"
              : "rgba(220, 38, 38, 0.1)",
            color: statusMessage ? "#059669" : "#dc2626",
          }}
        >
          {statusMessage || errorMessage}
        </div>
      )}
    </div>
  );
}
