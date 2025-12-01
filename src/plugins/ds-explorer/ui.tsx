import { useState, useCallback, useEffect } from "react";
import { Card } from "@shell/components";
import { postToFigma } from "@shared/bridge";
import { componentRegistry, componentGroups } from "./utils/componentData";
import { PropertyInfo, PropertyStates, ComponentData } from "./types";
import { IconSearch } from "@tabler/icons-react";

// Helper function to clean property name by removing #ID suffix
function cleanPropertyName(name: string): string {
  // Remove #ID suffix (e.g., "label#259:52" -> "label")
  return name.replace(/#\d+:\d+$/, "");
}

export function DSExplorerUI() {
  const [selectedComponent, setSelectedComponent] = useState<string | null>(
    null,
  );
  const [searchTerm, setSearchTerm] = useState("");
  const [componentData, setComponentData] = useState<ComponentData | null>(
    null,
  );
  const [propertyStates, setPropertyStates] = useState<PropertyStates>({});
  const [isLoading, setIsLoading] = useState(false);

  // ...existing code...

  // Filter groups based on search
  const filteredGroups = componentGroups
    .map((group) =>
      group.filter(([name]) =>
        name.toLowerCase().includes(searchTerm.toLowerCase()),
      ),
    )
    .filter((group) => group.length > 0);

  // Handle component selection
  const handleComponentSelect = useCallback((name: string) => {
    const component = componentRegistry[name];
    if (!component) {
      return;
    }

    setSelectedComponent(name);
    setIsLoading(true);
    setComponentData(null);
    setPropertyStates({});

    const requestId = `get-props-${Date.now()}`;

    const messagePayload = {
      key: component.key,
      name: component.name,
      requestId,
    };

    postToFigma({
      target: "ds-explorer",
      action: "get-component-properties",
      payload: messagePayload,
      requestId,
    });
  }, []);

  // Handle property toggle
  const handlePropertyToggle = useCallback((propertyKey: string) => {
    setPropertyStates((prev) => ({
      ...prev,
      [propertyKey]: !prev[propertyKey],
    }));
  }, []);

  // Handle build
  const handleBuild = useCallback(() => {
    if (!selectedComponent) return;

    const requestId = `build-${Date.now()}`;

    postToFigma({
      target: "ds-explorer",
      action: "build-component",
      payload: {
        componentKey: componentRegistry[selectedComponent].key,
        ...propertyStates,
        requestId,
      },
      requestId,
    });
  }, [selectedComponent, propertyStates]);

  // Listen for component data
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      // Unwrap pluginMessage from Figma
      const message = event.data.pluginMessage || event.data;

      if (
        message.type === "response" &&
        message.requestId?.startsWith("get-props-")
      ) {
        if (message.result) {
          setComponentData(message.result);
          // Initialize all properties as enabled
          const initialStates: PropertyStates = {};
          message.result.properties.forEach((prop: PropertyInfo) => {
            initialStates[prop.name] = true;
            // Initialize variant options
            if (prop.type === "VARIANT" && prop.variantOptions) {
              prop.variantOptions.forEach((option) => {
                initialStates[`${prop.name}#${option}`] = true;
              });
            }
          });
          setPropertyStates(initialStates);
        }
        setIsLoading(false);
      } else if (message.type === "error") {
        setIsLoading(false);
      }
    };

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, []);

  return (
    <div style={{ display: "flex", height: "100%", gap: "16px" }}>
      {/* Left Panel - Preview */}
      <div
        className="main-view"
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
        }}
      >
        {selectedComponent ? (
          <>
            <Card title={selectedComponent}>
              {componentData?.image ? (
                <img
                  src={componentData.image}
                  alt={selectedComponent}
                  style={{
                    maxWidth: "100%",
                    maxHeight: "200px",
                    objectFit: "contain",
                  }}
                />
              ) : (
                <div
                  style={{
                    height: "200px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "#9ca3af",
                    fontSize: "13px",
                  }}
                >
                  {isLoading ? "Loading preview..." : "No preview available"}
                </div>
              )}
            </Card>

            {componentData?.description && (
              <Card title="Description">
                <div
                  style={{
                    fontSize: "13px",
                    color: "#4b5563",
                    lineHeight: "1.6",
                  }}
                >
                  {componentData.description}
                </div>
              </Card>
            )}

            <Card title="Properties">
              {componentData?.properties &&
              componentData.properties.length > 0 ? (
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "12px",
                  }}
                >
                  {componentData.properties.map((prop) => {
                    const isVariantProperty = prop.type === "VARIANT";
                    const isPropertyEnabled = isVariantProperty
                      ? true
                      : (propertyStates[prop.name] ?? true);
                    return (
                      <div key={prop.name}>
                        <label
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "8px",
                            fontSize: "13px",
                            cursor: isVariantProperty ? "default" : "pointer",
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={isPropertyEnabled}
                            disabled={isVariantProperty}
                            title={
                              isVariantProperty
                                ? "Variant properties stay enabled. Disable individual variant values instead."
                                : undefined
                            }
                            onChange={() => {
                              if (!isVariantProperty) {
                                handlePropertyToggle(prop.name);
                              }
                            }}
                          />
                          <span style={{ fontWeight: 500 }}>
                            {cleanPropertyName(prop.name)}
                          </span>
                          <span style={{ color: "#9ca3af", fontSize: "12px" }}>
                            ({prop.type})
                          </span>
                        </label>
                        {isVariantProperty && (
                          <div
                            style={{
                              marginLeft: "28px",
                              marginTop: "6px",
                              color: "#6b7280",
                              fontSize: "11px",
                              lineHeight: 1.4,
                            }}
                          >
                            Variant properties are structural and remain
                            enabled. Use the options below to filter the
                            variants that are included when building.
                          </div>
                        )}

                        {/* Variant options */}
                        {isVariantProperty &&
                          prop.variantOptions &&
                          isPropertyEnabled && (
                            <div
                              style={{
                                marginLeft: "28px",
                                marginTop: "8px",
                                display: "flex",
                                flexDirection: "column",
                                gap: "6px",
                              }}
                            >
                              {prop.variantOptions.map((option) => (
                                <label
                                  key={option}
                                  style={{
                                    display: "flex",
                                    alignItems: "center",
                                    gap: "8px",
                                    fontSize: "12px",
                                    cursor: "pointer",
                                  }}
                                >
                                  <input
                                    type="checkbox"
                                    checked={
                                      propertyStates[
                                        `${prop.name}#${option}`
                                      ] ?? true
                                    }
                                    onChange={() =>
                                      handlePropertyToggle(
                                        `${prop.name}#${option}`,
                                      )
                                    }
                                  />
                                  <span>{option}</span>
                                </label>
                              ))}
                            </div>
                          )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div
                  style={{
                    textAlign: "center",
                    color: "#9ca3af",
                    fontSize: "13px",
                    padding: "20px",
                  }}
                >
                  {isLoading
                    ? "Loading properties..."
                    : "No properties available"}
                </div>
              )}
            </Card>
          </>
        ) : (
          <div
            style={{
              height: "100%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexDirection: "column",
              gap: "12px",
              overflow: "hidden",
              maxHeight: "calc(100% - 4px)",
              color: "#9ca3af",
            }}
          >
            <div style={{ fontSize: "32px", opacity: 0.3 }}>✦</div>
            <div style={{ fontSize: "14px", fontWeight: 500 }}>
              Select a component
            </div>
            <div style={{ fontSize: "12px" }}>
              Choose from the list to preview and configure
            </div>
          </div>
        )}

        {/* Build Button (Fixed at bottom) */}
        {selectedComponent && (
          <div
            style={{
              position: "static",
              display: "flex",
              justifyContent: "flex-end",
              width: "100%",
              zIndex: 1000,
            }}
          >
            <button
              onClick={handleBuild}
              disabled={isLoading}
              style={{
                padding: "12px 32px",
                backgroundColor: isLoading ? "#9ca3af" : "#2563eb",
                color: "#ffffff",
                border: "none",
                borderRadius: "6px",
                fontSize: "14px",
                fontWeight: 500,
                cursor: isLoading ? "not-allowed" : "pointer",
                boxShadow: "0 4px 6px rgba(0, 0, 0, 0.1)",
                transition: "all 0.15s ease",
              }}
            >
              Build Component
            </button>
          </div>
        )}
      </div>

      {/* Right Panel - Component List */}
      <div
        className="right-menu"
        style={{
          width: "240px",
          backgroundColor: "#fafafa",
          border: "1px solid #e5e7eb",
          borderRadius: "8px",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        {/* Search */}
        <div
          className="search-wrapper"
          style={{ padding: "12px", borderBottom: "1px solid #e5e7eb" }}
        >
          <input
            type="text"
            placeholder="Search components..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{
              width: "100%",
              padding: "8px 12px",
              border: "1px solid #d1d5db",
              borderRadius: "6px",
              fontSize: "13px",
            }}
          />
          <IconSearch size={16} />
        </div>

        {/* Component List */}
        <div style={{ flex: 1, overflowY: "auto", padding: "8px" }}>
          {filteredGroups.map((group, groupIndex) => {
            // Get group names for headers
            const groupNames = [
              "Avatar",
              "Badge",
              "Navigation & Buttons",
              "Form Controls",
              "Inputs",
              "Radio & Other Controls",
              "Link",
              "Slider",
              "Search",
              "Tabs",
              "Tooltip",
              "Toggle",
              "Molecules",
              "Banner",
              "Dropdown",
              "List",
              "Pagination",
              "Progress Bar",
              "Snackbar",
              "Toast",
              "Organisms",
              "Cards",
              "Date picker",
              "Modal",
              "Progress Indicator",
              "Table",
            ];
            // ...existing code...
            const groupName =
              groupNames[groupIndex] || `Group ${groupIndex + 1}`;

            return (
              <div key={groupIndex}>
                {/* Group Header */}
                <div
                  style={{
                    padding: "6px 12px",
                    fontSize: "11px",
                    fontWeight: 600,
                    color: "#6b7280",
                    textTransform: "uppercase",
                    letterSpacing: "0.5px",
                    borderBottom: "1px solid #e5e7eb",
                    marginBottom: "4px",
                  }}
                >
                  {groupName}
                </div>

                {/* Group Items */}
                {group.map(([name]) => (
                  <div
                    key={name}
                    onClick={() => handleComponentSelect(name)}
                    style={{
                      padding: "8px 12px",
                      marginBottom: "2px",
                      borderRadius: "6px",
                      cursor: "pointer",
                      fontSize: "13px",
                      backgroundColor:
                        selectedComponent === name ? "#eff6ff" : "transparent",
                      color: selectedComponent === name ? "#2563eb" : "#374151",
                      fontWeight: selectedComponent === name ? 500 : 400,
                      transition: "all 0.15s ease",
                    }}
                    onMouseEnter={(e) => {
                      if (selectedComponent !== name) {
                        e.currentTarget.style.backgroundColor = "#f3f4f6";
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (selectedComponent !== name) {
                        e.currentTarget.style.backgroundColor = "transparent";
                      }
                    }}
                  >
                    {name}
                  </div>
                ))}
              </div>
            );
          })}

          {filteredGroups.length === 0 && (
            <div
              style={{
                padding: "40px 20px",
                textAlign: "center",
                color: "#9ca3af",
                fontSize: "13px",
              }}
            >
              No components found
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
