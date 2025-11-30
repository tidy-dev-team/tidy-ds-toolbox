import React, { useState, useCallback, useEffect } from "react";
import { Card } from "@shell/components";
import { postToFigma } from "@shared/bridge";
import { debugLog } from "@shared/logging";
import {
  ColorVariable,
  VariableCollection,
  Page,
  SearchProgress,
  StreamingResult,
} from "./types";

export function TokenTrackerUI() {
  const [colorVariables, setColorVariables] = useState<ColorVariable[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isSearching, setIsSearching] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [selectedVariables, setSelectedVariables] = useState<Set<string>>(
    new Set()
  );
  const [collections, setCollections] = useState<VariableCollection[]>([]);
  const [selectedCollectionId, setSelectedCollectionId] = useState<
    string | null
  >(null);
  const [pages, setPages] = useState<Page[]>([]);
  const [selectedPageId, setSelectedPageId] = useState<string | null>(null);
  const [searchProgress, setSearchProgress] = useState<SearchProgress | null>(
    null
  );
  const [streamingResults, setStreamingResults] = useState<StreamingResult[]>(
    []
  );

  // Load collections and pages on mount
  useEffect(() => {
    // Request collections
    postToFigma({
      target: "token-tracker",
      action: "get-collections",
      payload: {},
    });

    // Request pages
    postToFigma({
      target: "token-tracker",
      action: "get-pages",
      payload: {},
    });
  }, []);

  // Listen for messages from Figma
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const message = event.data.pluginMessage || event.data;
      debugLog("📨 Token Tracker UI received message:", message);

      if (message.type === "collections-result") {
        debugLog("📋 Setting collections:", message.collections);
        setCollections(message.collections);
        if (message.collections.length > 0 && selectedCollectionId === null) {
          setSelectedCollectionId(message.collections[0].id);
        }
      } else if (message.type === "pages-result") {
        debugLog("📄 Setting pages:", message.pages);
        setPages(message.pages);
        if (message.currentPageId && selectedPageId === null) {
          setSelectedPageId(message.currentPageId);
        }
      } else if (message.type === "variables-result") {
        debugLog("🎨 Setting variables:", message.variables);
        setColorVariables(message.variables);
        setIsLoading(false);
      } else if (message.type === "search-progress") {
        setSearchProgress(message.progress);
      } else if (message.type === "streaming-result") {
        setStreamingResults((prev) => [...prev, message.result]);
      } else if (message.type === "search-complete") {
        setIsSearching(false);
        setSearchProgress(null);
      }
    };

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [selectedCollectionId, selectedPageId]);

  const handleGetColorVariables = useCallback(() => {
    setIsLoading(true);
    const requestId = `get-vars-${Date.now()}`;
    postToFigma({
      target: "token-tracker",
      action: "get-color-variables",
      payload: { collectionId: selectedCollectionId },
      requestId,
    });
  }, [selectedCollectionId]);

  const handleSearchChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setSearchQuery(e.target.value);
    },
    []
  );

  // Filter variables based on search query and sort alphabetically
  const filteredVariables = colorVariables
    .filter((variable) =>
      variable.name.toLowerCase().includes(searchQuery.toLowerCase())
    )
    .sort((a, b) => a.name.localeCompare(b.name));

  const handleVariableSelect = useCallback(
    (variableId: string, checked: boolean) => {
      setSelectedVariables((prev) => {
        const newSet = new Set(prev);
        if (checked) {
          newSet.add(variableId);
        } else {
          newSet.delete(variableId);
        }
        return newSet;
      });
    },
    []
  );

  const handleSelectAll = useCallback(() => {
    setSelectedVariables(new Set(filteredVariables.map((v) => v.id)));
  }, [filteredVariables]);

  const handleSelectNone = useCallback(() => {
    setSelectedVariables(new Set());
  }, []);

  const handleFindBoundNodes = useCallback(() => {
    const selectedVariableIds = Array.from(selectedVariables);
    if (selectedVariableIds.length > 0) {
      debugLog(
        `🚀 Finding bound nodes for ${selectedVariableIds.length} selected variables...`
      );
      setIsSearching(true);
      setSearchProgress(null);
      setStreamingResults([]);
      postToFigma({
        target: "token-tracker",
        action: "find-bound-nodes",
        payload: {
          variableIds: selectedVariableIds,
          pageId: selectedPageId,
        },
      });
    }
  }, [selectedVariables, selectedPageId]);

  const handleCancelSearch = useCallback(() => {
    postToFigma({
      target: "token-tracker",
      action: "cancel-search",
      payload: {},
    });
    setIsSearching(false);
    setSearchProgress(null);
  }, []);

  const handleCollectionChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      setSelectedCollectionId(e.target.value || null);
    },
    []
  );

  const handlePageChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      setSelectedPageId(e.target.value || null);
    },
    []
  );

  const formatColor = (rgba: {
    r: number;
    g: number;
    b: number;
    a: number;
  }): string => {
    const r = Math.round(rgba.r * 255);
    const g = Math.round(rgba.g * 255);
    const b = Math.round(rgba.b * 255);
    return `rgb(${r}, ${g}, ${b})`;
  };

  const getColorPreview = (
    variable: ColorVariable
  ): { color: string; hexValue: string } => {
    const defaultModeValue = variable.valuesByMode[variable.defaultModeId];

    if (defaultModeValue) {
      if (
        typeof defaultModeValue === "object" &&
        defaultModeValue !== null &&
        "r" in defaultModeValue
      ) {
        const rgba = defaultModeValue as {
          r: number;
          g: number;
          b: number;
          a: number;
        };
        const r = Math.round(rgba.r * 255);
        const g = Math.round(rgba.g * 255);
        const b = Math.round(rgba.b * 255);
        const toHex = (n: number) => n.toString(16).padStart(2, "0");
        const hex = `#${toHex(r)}${toHex(g)}${toHex(b)}`.toUpperCase();

        return {
          color: formatColor(rgba),
          hexValue: hex,
        };
      }
    }
    return { color: "rgb(200, 200, 200)", hexValue: "#CCCCCC" };
  };

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        gap: "16px",
        padding: "16px",
      }}
    >
      {/* Collection Selector */}
      {collections.length > 0 && (
        <Card title="Collection">
          <select
            value={selectedCollectionId || ""}
            onChange={handleCollectionChange}
            style={{
              width: "100%",
              padding: "8px 12px",
              border: "1px solid #d1d5db",
              borderRadius: "6px",
              fontSize: "13px",
              backgroundColor: "#ffffff",
            }}
          >
            <option value="">All collections</option>
            {collections.map((collection) => (
              <option key={collection.id} value={collection.id}>
                {collection.name}
              </option>
            ))}
          </select>
        </Card>
      )}

      {/* Load Variables Button */}
      <button
        onClick={handleGetColorVariables}
        disabled={isLoading}
        style={{
          padding: "10px 16px",
          backgroundColor: isLoading ? "#9ca3af" : "#2563eb",
          color: "#ffffff",
          border: "none",
          borderRadius: "6px",
          fontSize: "13px",
          fontWeight: 500,
          cursor: isLoading ? "not-allowed" : "pointer",
          transition: "background-color 0.15s ease",
        }}
      >
        {isLoading ? "Loading..." : "Get Color Variables"}
      </button>

      {/* Variables List */}
      {colorVariables.length > 0 && (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "12px",
            flex: 1,
            minHeight: 0,
          }}
        >
          <Card title={`Variables (${colorVariables.length})`}>
            {/* Search */}
            <input
              type="text"
              placeholder="Search variables by name..."
              value={searchQuery}
              onChange={handleSearchChange}
              style={{
                width: "100%",
                padding: "8px 12px",
                border: "1px solid #d1d5db",
                borderRadius: "6px",
                fontSize: "13px",
                marginBottom: "12px",
              }}
            />

            {/* Select All/None */}
            {filteredVariables.length > 0 && (
              <div
                style={{
                  display: "flex",
                  gap: "8px",
                  marginBottom: "12px",
                }}
              >
                <button
                  onClick={handleSelectAll}
                  style={{
                    flex: 1,
                    padding: "6px 12px",
                    backgroundColor: "#f3f4f6",
                    border: "1px solid #d1d5db",
                    borderRadius: "4px",
                    fontSize: "12px",
                    cursor: "pointer",
                  }}
                >
                  Select All
                </button>
                <button
                  onClick={handleSelectNone}
                  style={{
                    flex: 1,
                    padding: "6px 12px",
                    backgroundColor: "#f3f4f6",
                    border: "1px solid #d1d5db",
                    borderRadius: "4px",
                    fontSize: "12px",
                    cursor: "pointer",
                  }}
                >
                  Select None
                </button>
              </div>
            )}

            {/* Variable List */}
            <div
              style={{
                maxHeight: "300px",
                overflowY: "auto",
                border: "1px solid #e5e7eb",
                borderRadius: "6px",
                padding: "8px",
                backgroundColor: "#fafafa",
              }}
            >
              {filteredVariables.length > 0 ? (
                filteredVariables.map((variable) => {
                  const preview = getColorPreview(variable);
                  const isSelected = selectedVariables.has(variable.id);
                  return (
                    <div
                      key={variable.id}
                      onClick={() =>
                        handleVariableSelect(variable.id, !isSelected)
                      }
                      style={{
                        display: "flex",
                        alignItems: "center",
                        marginBottom: "6px",
                        padding: "10px 12px",
                        borderRadius: "6px",
                        backgroundColor: isSelected ? "#e3f2fd" : "white",
                        border: isSelected
                          ? "2px solid #2196f3"
                          : "1px solid #e0e0e0",
                        cursor: "pointer",
                        transition: "all 0.15s ease",
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={(e) =>
                          handleVariableSelect(variable.id, e.target.checked)
                        }
                        onClick={(e) => e.stopPropagation()}
                        style={{ marginRight: "10px" }}
                      />
                      <div
                        style={{
                          width: "32px",
                          height: "32px",
                          backgroundColor: preview.color,
                          borderRadius: "4px",
                          marginRight: "12px",
                          border: "1px solid rgba(0,0,0,0.1)",
                          flexShrink: 0,
                        }}
                      />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div
                          style={{
                            fontSize: "12px",
                            fontWeight: 600,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                            marginBottom: "2px",
                          }}
                        >
                          {variable.name}
                        </div>
                        <div
                          style={{
                            fontSize: "11px",
                            color: "#666",
                            fontFamily: "monospace",
                          }}
                        >
                          {preview.hexValue}
                        </div>
                      </div>
                    </div>
                  );
                })
              ) : (
                <div
                  style={{
                    padding: "20px",
                    textAlign: "center",
                    color: "#9ca3af",
                    fontSize: "13px",
                  }}
                >
                  {searchQuery
                    ? `No variables found matching "${searchQuery}"`
                    : "No variables to display"}
                </div>
              )}
            </div>
          </Card>

          {/* Page Selector */}
          {pages.length > 0 && (
            <Card title="Search Scope">
              <select
                value={selectedPageId || ""}
                onChange={handlePageChange}
                style={{
                  width: "100%",
                  padding: "8px 12px",
                  border: "1px solid #d1d5db",
                  borderRadius: "6px",
                  fontSize: "13px",
                  backgroundColor: "#ffffff",
                }}
              >
                <option value="">All pages</option>
                {pages.map((page) => (
                  <option key={page.id} value={page.id}>
                    {page.name}
                  </option>
                ))}
              </select>
            </Card>
          )}

          {/* Find Button */}
          <button
            onClick={handleFindBoundNodes}
            disabled={selectedVariables.size === 0 || isSearching}
            style={{
              padding: "12px 16px",
              backgroundColor:
                selectedVariables.size === 0 || isSearching
                  ? "#9ca3af"
                  : "#10b981",
              color: "#ffffff",
              border: "none",
              borderRadius: "6px",
              fontSize: "14px",
              fontWeight: 500,
              cursor:
                selectedVariables.size === 0 || isSearching
                  ? "not-allowed"
                  : "pointer",
              transition: "background-color 0.15s ease",
            }}
          >
            {isSearching
              ? "Searching..."
              : `Find Bound Nodes (${selectedVariables.size} selected)`}
          </button>

          {/* Progress UI */}
          {isSearching && (
            <Card title="Search Progress">
              {/* Progress Bar */}
              <div
                style={{
                  width: "100%",
                  height: "8px",
                  backgroundColor: "#e0e0e0",
                  borderRadius: "4px",
                  overflow: "hidden",
                  marginBottom: "8px",
                }}
              >
                <div
                  style={{
                    width: `${searchProgress?.percentage || 0}%`,
                    height: "100%",
                    backgroundColor: "#2196f3",
                    transition: "width 0.2s ease",
                  }}
                />
              </div>

              {/* Progress Text */}
              <div
                style={{ fontSize: "12px", color: "#666", marginBottom: "8px" }}
              >
                {searchProgress
                  ? `${searchProgress.percentage}% (${searchProgress.current}/${searchProgress.total} nodes) - Found: ${searchProgress.nodesFound}`
                  : "Initializing search..."}
              </div>

              {searchProgress?.currentVariableName && (
                <div
                  style={{
                    fontSize: "11px",
                    color: "#666",
                    fontStyle: "italic",
                    marginBottom: "12px",
                  }}
                >
                  Searching for: {searchProgress.currentVariableName} (
                  {searchProgress.currentVariableIndex} of{" "}
                  {searchProgress.totalVariables})
                </div>
              )}

              {/* Streaming Results Preview */}
              {streamingResults.length > 0 && (
                <div
                  style={{
                    maxHeight: "100px",
                    overflowY: "auto",
                    fontSize: "11px",
                    padding: "8px",
                    backgroundColor: "#f5f5f5",
                    borderRadius: "4px",
                    marginBottom: "12px",
                  }}
                >
                  {streamingResults.slice(-5).map((result, idx) => (
                    <div key={idx} style={{ marginBottom: "4px" }}>
                      ✓ {result.instanceNode.name} (
                      {result.instanceNode.pageName})
                    </div>
                  ))}
                </div>
              )}

              {/* Cancel Button */}
              <button
                onClick={handleCancelSearch}
                style={{
                  width: "100%",
                  padding: "8px 16px",
                  backgroundColor: "#ef4444",
                  color: "#ffffff",
                  border: "none",
                  borderRadius: "6px",
                  fontSize: "13px",
                  fontWeight: 500,
                  cursor: "pointer",
                }}
              >
                Cancel Search
              </button>
            </Card>
          )}
        </div>
      )}

      {/* Empty State */}
      {!isLoading && colorVariables.length === 0 && (
        <div
          style={{
            flex: 1,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexDirection: "column",
            gap: "12px",
            color: "#9ca3af",
          }}
        >
          <div style={{ fontSize: "32px", opacity: 0.3 }}>🎨</div>
          <div style={{ fontSize: "14px", fontWeight: 500 }}>
            No Variables Loaded
          </div>
          <div
            style={{ fontSize: "12px", textAlign: "center", maxWidth: "250px" }}
          >
            Select a collection and click "Get Color Variables" to start
            tracking variable usage
          </div>
        </div>
      )}
    </div>
  );
}
