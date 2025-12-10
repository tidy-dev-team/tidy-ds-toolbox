import { useState, useCallback, useEffect } from "react";
import { Card, FormControl } from "@shell/components";
import { postToFigma } from "@shared/bridge";
import { ELEMENT_OPTIONS } from "./utils/constants";

export function TidyMapperUI() {
  // State
  const [sliceName, setSliceName] = useState<string>("Avatar");
  const [trailNames, setTrailNames] = useState<string[]>([]);
  const [showTrails, setShowTrails] = useState<boolean>(false);
  const [selectedTrailFilter, setSelectedTrailFilter] = useState<string>("");
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [lastResult, setLastResult] = useState<string>("");
  const [isStarted, setIsStarted] = useState<boolean>(false);

  // Initialize - get current name and trail names
  useEffect(() => {
    postToFigma({
      target: "tidy-mapper",
      action: "get-current-name",
      payload: {},
    });

    postToFigma({
      target: "tidy-mapper",
      action: "get-trail-names",
      payload: {},
    });
  }, []);

  // Listen for messages from Figma
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const message = event.data.pluginMessage || event.data;

      if (message.type === "response") {
        // Handle response with result
        if (message.result?.name !== undefined) {
          setSliceName(message.result.name);
        }
        if (message.result?.names !== undefined) {
          setTrailNames(message.result.names);
        }
        if (message.result?.success !== undefined) {
          setIsProcessing(false);
          if (message.result.success) {
            setLastResult(`Exported ${message.result.count} slices`);
          } else {
            setLastResult(message.result.message || "No slices found");
          }
        }
      } else if (message.type === "trail-names-update") {
        setTrailNames(message.names || []);
      } else if (message.type === "slice-created") {
        // Flash indicator that a slice was created
        setIsStarted(true);
        setLastResult("New slice created");
        setTimeout(() => setLastResult(""), 2000);
      } else if (message.type === "error") {
        setIsProcessing(false);
        setLastResult("Error: " + (message.error || "Unknown error"));
      }
    };

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, []);

  // Handle slice name change
  const handleNameChange = useCallback((name: string) => {
    setSliceName(name);
    postToFigma({
      target: "tidy-mapper",
      action: "set-slice-name",
      payload: { name },
    });
  }, []);

  // Handle grab slices
  const handleGrabSlices = useCallback(() => {
    setIsProcessing(true);
    setLastResult("");

    const requestId = `grab-slices-${Date.now()}`;

    postToFigma({
      target: "tidy-mapper",
      action: "grab-slices",
      payload: {},
      requestId,
    });
  }, []);

  // Handle show/hide all trails
  const handleToggleTrails = useCallback((visible: boolean) => {
    setShowTrails(visible);
    setSelectedTrailFilter("");
    postToFigma({
      target: "tidy-mapper",
      action: "show-trails",
      payload: { visible },
    });
  }, []);

  // Handle filter trails by name
  const handleFilterTrails = useCallback(
    (name: string) => {
      setSelectedTrailFilter(name);
      if (name) {
        setShowTrails(true);
        postToFigma({
          target: "tidy-mapper",
          action: "show-chosen",
          payload: { name },
        });
      } else {
        postToFigma({
          target: "tidy-mapper",
          action: "show-trails",
          payload: { visible: showTrails },
        });
      }
    },
    [showTrails],
  );

  // Refresh trail names
  const handleRefreshTrails = useCallback(() => {
    postToFigma({
      target: "tidy-mapper",
      action: "get-trail-names",
      payload: {},
    });
  }, []);

  // Instructions component
  const Instructions = () => {
    const instructionsStyle = {
      display: "flex",
      flexDirection: "column" as const,
      justifyContent: "flex-start",
      alignItems: "center",
      gap: "10px",
    };

    const textStyle = {
      fontSize: "12px",
      fontWeight: "regular",
      color: "#b3b3b3",
      padding: "0px",
      margin: "0px",
      textAlign: "center" as const,
    };

    const proTextStyle = {
      fontSize: "12px",
      fontWeight: "regular",
      color: "#9b9b9b",
      padding: "0px",
      margin: "2px 0",
      textAlign: "left" as const,
    };

    const proTextHeaderStyle = {
      fontSize: "12px",
      fontWeight: "Bold",
      color: "#696969",
      padding: "0px",
      margin: "4px 0",
      textAlign: "left" as const,
    };

    const proTipStyle = {
      display: "flex",
      flexDirection: "column" as const,
      justifyContent: "flex-start",
      alignItems: "flex-start",
      padding: "10px",
    };

    const DefaultInstructions = (
      <div style={instructionsStyle}>
        <svg
          width="70"
          viewBox="0 0 28 17"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            fillRule="evenodd"
            clipRule="evenodd"
            d="M16.6465 0.146447C16.8417 -0.0488155 17.1583 -0.0488155 17.3536 0.146447L19.3536 2.14645C19.5488 2.34171 19.5488 2.65829 19.3536 2.85355L9.50001 12.7071V16.5C9.50001 16.7761 9.27616 17 9.00001 17H1.00001C0.797783 17 0.615465 16.8782 0.538075 16.6913C0.460684 16.5045 0.503462 16.2894 0.646461 16.1464L16.6465 0.146447ZM9.50001 11.2929L18.2929 2.5L17 1.20711L9.50001 8.70711V11.2929ZM8.50001 9.70711L2.20712 16H8.50001V9.70711ZM23.6465 11.3536L20.6465 8.35355L21.3536 7.64645L24 10.2929L26.6465 7.64645L27.3536 8.35355L24.3536 11.3536C24.1583 11.5488 23.8417 11.5488 23.6465 11.3536Z"
            fill="#b3b3b3"
          />
        </svg>
        <div>
          <p style={textStyle}>Select Slice tool ("S" key)</p>
          <p style={textStyle}>and start mapping</p>
        </div>
      </div>
    );

    const ProTip = (
      <div style={proTipStyle}>
        <p style={proTextHeaderStyle}>Pro tip:</p>
        <p style={proTextStyle}>For easy cruise change preferences:</p>
        <p style={proTextStyle}>
          <i>main menu &gt; preferences &gt; keep tool selected after use</i>
        </p>
      </div>
    );

    return isStarted ? ProTip : DefaultInstructions;
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
      {/* Slice Naming */}
      <Card title="Component">
        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          <FormControl label="Component">
            <select
              value={sliceName}
              onChange={(e) => handleNameChange(e.target.value)}
              style={{
                width: "100%",
                padding: "8px 12px",
                border: "1px solid #d1d5db",
                borderRadius: "6px",
                fontSize: "13px",
                backgroundColor: "#ffffff",
              }}
            >
              {ELEMENT_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </FormControl>

          <Instructions />
        </div>
      </Card>

      {/* Export Slices */}
      <Card title="Export">
        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          <button onClick={handleGrabSlices} disabled={isProcessing}>
            {isProcessing ? "Processing..." : "Export slices"}
          </button>

          {lastResult && (
            <div
              style={{
                padding: "8px 12px",
                backgroundColor: lastResult.startsWith("Error")
                  ? "#fef2f2"
                  : "#f0fdf4",
                border: lastResult.startsWith("Error")
                  ? "1px solid #fecaca"
                  : "1px solid #bbf7d0",
                borderRadius: "6px",
                fontSize: "12px",
                color: lastResult.startsWith("Error") ? "#dc2626" : "#16a34a",
              }}
            >
              {lastResult}
            </div>
          )}
        </div>
      </Card>

      {/* Trail Visibility */}
      <Card title="Trail Markers">
        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          {/* Trail buttons */}
          <div
            style={{
              display: "flex",
              gap: "8px",
            }}
          >
            <button
              className="secondary"
              onClick={() => handleToggleTrails(true)}
            >
              Show trails
            </button>
            <button
              className="secondary"
              onClick={() => handleToggleTrails(false)}
            >
              Hide trails
            </button>
            <button
              className="secondary"
              onClick={() => handleFilterTrails(sliceName)}
            >
              Selected trails only
            </button>
          </div>

          {trailNames.length > 0 && (
            <FormControl label="Filter by Name">
              <div style={{ display: "flex", gap: "8px" }}>
                <select
                  value={selectedTrailFilter}
                  onChange={(e) => handleFilterTrails(e.target.value)}
                  style={{
                    flex: 1,
                    padding: "8px 12px",
                    border: "1px solid #d1d5db",
                    borderRadius: "6px",
                    fontSize: "13px",
                    backgroundColor: "#ffffff",
                  }}
                >
                  <option value="">All trails</option>
                  {trailNames.map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
                </select>
                <button
                  className="secondary"
                  onClick={handleRefreshTrails}
                  title="Refresh trail list"
                >
                  ↻
                </button>
              </div>
            </FormControl>
          )}

          {trailNames.length === 0 && (
            <div
              style={{
                fontSize: "12px",
                color: "#9ca3af",
                fontStyle: "italic",
              }}
            >
              No trail markers found on this page
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
