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
      justifyContent: "center",
      alignItems: "center",
      gap: "10px",
    };

    const textStyle = {
      fontSize: "12px",
      fontWeight: "regular",
      color: "#b3b3b3",
      padding: "0px",
      margin: "0px",
      textAlign: "left" as const,
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
          width="26"
          height="23"
          viewBox="0 0 26 23"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            fill-rule="evenodd"
            clip-rule="evenodd"
            d="M22.0952 0.198134C22.3623 -0.0660447 22.7956 -0.0660447 23.0628 0.198134L25.7997 2.90402C26.0668 3.1682 26.0668 3.59651 25.7997 3.86068L12.3158 17.192V22.3235C12.3158 22.6971 12.0095 23 11.6316 23H0.684224C0.407493 23 0.158005 22.8352 0.0521028 22.5823C-0.0538006 22.3296 0.00473774 22.0386 0.200421 21.8451L22.0952 0.198134ZM12.3158 15.2786L24.3482 3.38235L22.5789 1.63315L12.3158 11.7802V15.2786ZM10.9474 13.1331L2.33606 21.6471H10.9474V13.1331Z"
            fill="#B3B3B3"
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
      <Card title="Build">
        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          <button onClick={handleGrabSlices} disabled={isProcessing}>
            {isProcessing ? "Processing..." : "Build slices"}
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
              flexWrap: "wrap",
            }}
          >
            <button
              className="secondary fill-button"
              onClick={() => handleToggleTrails(true)}
            >
              Show trails
            </button>
            <button
              className="secondary fill-button"
              onClick={() => handleToggleTrails(false)}
            >
              Hide trails
            </button>
            <button
              className="secondary fill-button"
              onClick={() => handleFilterTrails(sliceName)}
            >
              Component trails
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
        </div>
      </Card>
    </div>
  );
}
