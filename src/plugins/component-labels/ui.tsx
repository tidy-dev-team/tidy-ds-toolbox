import { useState, useCallback, useEffect } from "react";
import { Card, FormControl } from "@shell/components";
import { postToFigma } from "@shared/bridge";
import { LabelConfig, VariantProperty } from "./types";

const DEFAULT_OPTION = "Choose property";

export function ComponentLabelsUI() {
  // State management
  const [topValue, setTopValue] = useState<string>(DEFAULT_OPTION);
  const [leftValue, setLeftValue] = useState<string>(DEFAULT_OPTION);
  const [secondTopValue, setSecondTopValue] = useState<string>(DEFAULT_OPTION);
  const [secondLeftValue, setSecondLeftValue] =
    useState<string>(DEFAULT_OPTION);
  const [groupSecondTop, setGroupSecondTop] = useState<boolean>(true);
  const [groupSecondLeft, setGroupSecondLeft] = useState<boolean>(true);
  const [properties, setProperties] = useState<string[]>([DEFAULT_OPTION]);
  const [spacing, setSpacing] = useState<number>(16);
  const [fontSize, setFontSize] = useState<number>(12);
  const [extractElement, setExtractElement] = useState<boolean>(false);
  const [hasSelection, setHasSelection] = useState<boolean>(false);

  // Initialize plugin on mount
  useEffect(() => {
    postToFigma({
      target: "component-labels",
      action: "init",
      payload: {},
    });

    // Request initial selection state
    postToFigma({
      target: "component-labels",
      action: "selection-change",
      payload: {},
    });
  }, []);

  // Listen for messages from Figma
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const message = event.data.pluginMessage || event.data;

      if (message.type === "settings") {
        // Load saved settings
        const {
          spacing: savedSpacing,
          fontSize: savedFontSize,
          extractElement: savedExtract,
        } = message.payload;
        if (savedSpacing) setSpacing(JSON.parse(savedSpacing));
        if (savedFontSize) setFontSize(JSON.parse(savedFontSize));
        if (savedExtract !== undefined)
          setExtractElement(JSON.parse(savedExtract));
      } else if (message.type === "variant-props") {
        // Load variant properties from selected component set
        const props = message.payload as Record<string, VariantProperty>;
        if (!props) return;

        const propKeys = Object.keys(props);
        setProperties([DEFAULT_OPTION, ...propKeys]);
        setHasSelection(true);

        // Auto-select properties if they match common naming conventions
        if (propKeys.includes("type")) {
          setTopValue("type");
        }

        if (propKeys.includes("state")) {
          setLeftValue("state");
        }

        // If there are exactly two properties, assign them to top and left
        if (propKeys.length === 2) {
          setTopValue(propKeys[0]);
          setLeftValue(propKeys[1]);
        }
      } else if (message.type === "selection-cleared") {
        handleReset();
        setHasSelection(false);
      } else if (message.type === "error") {
        setHasSelection(false);
      }
    };

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, []);

  // Handle building labels
  const handleBuildLabels = useCallback(() => {
    const selected: LabelConfig = {
      top: topValue === DEFAULT_OPTION ? "" : topValue,
      left: leftValue === DEFAULT_OPTION ? "" : leftValue,
      secondTop: secondTopValue === DEFAULT_OPTION ? "" : secondTopValue,
      secondLeft: secondLeftValue === DEFAULT_OPTION ? "" : secondLeftValue,
      groupSecondTop,
      groupSecondLeft,
    };

    postToFigma({
      target: "component-labels",
      action: "build-labels",
      payload: {
        labels: selected,
        spacing,
        fontSize,
        extractElement,
      },
    });
  }, [
    topValue,
    leftValue,
    secondTopValue,
    secondLeftValue,
    groupSecondTop,
    groupSecondLeft,
    spacing,
    fontSize,
    extractElement,
  ]);

  // Handle reset
  const handleReset = useCallback(() => {
    setTopValue(DEFAULT_OPTION);
    setLeftValue(DEFAULT_OPTION);
    setSecondTopValue(DEFAULT_OPTION);
    setSecondLeftValue(DEFAULT_OPTION);
    setGroupSecondTop(true);
    setGroupSecondLeft(true);
    setProperties([DEFAULT_OPTION]);
    setFontSize(12);
  }, []);

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
      {!hasSelection ? (
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
          <div style={{ fontSize: "32px", opacity: 0.3 }}>❦</div>
          <div style={{ fontSize: "14px", fontWeight: 500 }}>
            Select a Component Set
          </div>
          <div
            style={{ fontSize: "12px", textAlign: "center", maxWidth: "250px" }}
          >
            Choose a component set in your Figma file to add variant labels
          </div>
        </div>
      ) : (
        <>
          <Card title="Label Configuration">
            <div
              style={{ display: "flex", flexDirection: "column", gap: "16px" }}
            >
              {/* Top Labels (Level 1) */}
              <FormControl label="⬆︎ Top labels (Level 1)">
                <select
                  value={topValue}
                  onChange={(e) => setTopValue(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "8px 12px",
                    border: "1px solid #d1d5db",
                    borderRadius: "6px",
                    fontSize: "13px",
                    backgroundColor: "#ffffff",
                  }}
                >
                  {properties.map((prop) => (
                    <option key={prop} value={prop}>
                      {prop}
                    </option>
                  ))}
                </select>
              </FormControl>

              {/* Left Labels (Level 1) */}
              <FormControl label="⬅︎ Left labels (Level 1)">
                <select
                  value={leftValue}
                  onChange={(e) => setLeftValue(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "8px 12px",
                    border: "1px solid #d1d5db",
                    borderRadius: "6px",
                    fontSize: "13px",
                    backgroundColor: "#ffffff",
                  }}
                >
                  {properties.map((prop) => (
                    <option key={prop} value={prop}>
                      {prop}
                    </option>
                  ))}
                </select>
              </FormControl>

              {/* Top Labels (Level 2) */}
              <FormControl label="⬆︎ Top labels (Level 2)">
                <select
                  value={secondTopValue}
                  onChange={(e) => setSecondTopValue(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "8px 12px",
                    border: "1px solid #d1d5db",
                    borderRadius: "6px",
                    fontSize: "13px",
                    backgroundColor: "#ffffff",
                  }}
                >
                  {properties.map((prop) => (
                    <option key={prop} value={prop}>
                      {prop}
                    </option>
                  ))}
                </select>
                <label
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                    fontSize: "12px",
                    marginTop: "8px",
                    cursor: "pointer",
                  }}
                >
                  <input
                    type="checkbox"
                    checked={groupSecondTop}
                    onChange={(e) => setGroupSecondTop(e.target.checked)}
                  />
                  Group labels
                </label>
              </FormControl>

              {/* Left Labels (Level 2) */}
              <FormControl label="⬅︎ Left labels (Level 2)">
                <select
                  value={secondLeftValue}
                  onChange={(e) => setSecondLeftValue(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "8px 12px",
                    border: "1px solid #d1d5db",
                    borderRadius: "6px",
                    fontSize: "13px",
                    backgroundColor: "#ffffff",
                  }}
                >
                  {properties.map((prop) => (
                    <option key={prop} value={prop}>
                      {prop}
                    </option>
                  ))}
                </select>
                <label
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                    fontSize: "12px",
                    marginTop: "8px",
                    cursor: "pointer",
                  }}
                >
                  <input
                    type="checkbox"
                    checked={groupSecondLeft}
                    onChange={(e) => setGroupSecondLeft(e.target.checked)}
                  />
                  Group labels
                </label>
              </FormControl>
            </div>
          </Card>

          <Card title="Settings">
            <div
              style={{ display: "flex", flexDirection: "column", gap: "16px" }}
            >
              {/* Spacing */}
              <FormControl label="📏 Spacing">
                <input
                  type="number"
                  value={spacing}
                  onChange={(e) => setSpacing(Number(e.target.value))}
                  style={{
                    width: "100%",
                    padding: "8px 12px",
                    border: "1px solid #d1d5db",
                    borderRadius: "6px",
                    fontSize: "13px",
                  }}
                />
              </FormControl>

              {/* Font Size */}
              <FormControl label="🔤 Font Size">
                <input
                  type="number"
                  value={fontSize}
                  onChange={(e) => setFontSize(Number(e.target.value))}
                  style={{
                    width: "100%",
                    padding: "8px 12px",
                    border: "1px solid #d1d5db",
                    borderRadius: "6px",
                    fontSize: "13px",
                  }}
                />
              </FormControl>

              {/* Extract Element */}
              <label
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  fontSize: "13px",
                  cursor: "pointer",
                }}
              >
                <input
                  type="checkbox"
                  checked={extractElement}
                  onChange={(e) => setExtractElement(e.target.checked)}
                />
                Extract element to the top
              </label>
            </div>
          </Card>

          {/* Build Button */}
          <button
            onClick={handleBuildLabels}
            disabled={properties.length === 1}
            style={{
              padding: "12px 16px",
              backgroundColor: properties.length === 1 ? "#9ca3af" : "#2563eb",
              color: "#ffffff",
              border: "none",
              borderRadius: "6px",
              fontSize: "14px",
              fontWeight: 500,
              cursor: properties.length === 1 ? "not-allowed" : "pointer",
              transition: "background-color 0.15s ease",
            }}
          >
            Add Labels
          </button>
        </>
      )}
    </div>
  );
}
