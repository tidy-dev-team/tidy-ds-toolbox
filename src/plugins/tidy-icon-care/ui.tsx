import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Card, FormControl } from "@shell/components";
import { postToFigma } from "@shared/bridge";
import { DEFAULT_TIDY_ICON_CARE_SETTINGS, TidyIconCareSettings } from "./types";

interface PendingRequest {
  onSuccess?: (result: any) => void;
  onError?: (error: string) => void;
  onFinally?: () => void;
}

export function TidyIconCareUI() {
  const [settings, setSettings] = useState<TidyIconCareSettings>(
    DEFAULT_TIDY_ICON_CARE_SETTINGS,
  );
  const [isLoading, setIsLoading] = useState(true);
  const [isBuilding, setIsBuilding] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const pendingRequests = useRef(new Map<string, PendingRequest>());

  const sendRequest = useCallback(
    (action: string, payload: any, handlers: PendingRequest = {}) => {
      const requestId = `tidy-icon-care-${action}-${Date.now()}`;
      pendingRequests.current.set(requestId, handlers);
      postToFigma({
        target: "tidy-icon-care",
        action,
        payload,
        requestId,
      });
      return requestId;
    },
    [],
  );

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

  useEffect(() => {
    setIsLoading(true);
    sendRequest(
      "load-params",
      {},
      {
        onSuccess: (result) => {
          if (result?.settings) {
            setSettings(result.settings);
          }
          setStatusMessage("Settings loaded from last session");
        },
        onError: (error) => setErrorMessage(error),
        onFinally: () => setIsLoading(false),
      },
    );
  }, [sendRequest]);

  const updateNumber = useCallback(
    (key: keyof TidyIconCareSettings, value: string) => {
      const numericValue = Number(value);
      if (!Number.isNaN(numericValue)) {
        setSettings((prev) => ({ ...prev, [key]: numericValue }));
      }
    },
    [],
  );

  const updateBoolean = useCallback(
    (key: keyof TidyIconCareSettings, value: boolean) => {
      setSettings((prev) => ({ ...prev, [key]: value }));
    },
    [],
  );

  const handleColorChange = useCallback((value: string) => {
    const normalized = value.replace("#", "").slice(0, 6).toUpperCase();
    setSettings((prev) => ({ ...prev, hexColor: normalized }));
  }, []);

  const handleLabelCaseChange = useCallback(
    (value: TidyIconCareSettings["labelCase"]) => {
      setSettings((prev) => ({ ...prev, labelCase: value }));
    },
    [],
  );

  const preparedSettings = useMemo(
    () => serializeSettings(settings),
    [settings],
  );

  const handleBuild = useCallback(() => {
    if (isLoading || isBuilding) return;
    setIsBuilding(true);
    setStatusMessage(null);
    setErrorMessage(null);

    sendRequest(
      "build-icon-grid",
      { settings: preparedSettings },
      {
        onSuccess: (result) => {
          if (result?.settings) {
            setSettings(result.settings);
          }
          setStatusMessage("Icon grid created successfully");
        },
        onError: (error) => {
          setErrorMessage(error);
        },
        onFinally: () => setIsBuilding(false),
      },
    );
  }, [isLoading, isBuilding, preparedSettings, sendRequest]);

  useEffect(() => {
    const handleKeydown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
        event.preventDefault();
        handleBuild();
      }
    };

    window.addEventListener("keydown", handleKeydown);
    return () => window.removeEventListener("keydown", handleKeydown);
  }, [handleBuild]);

  const colorInputValue = `#${settings.hexColor.padStart(6, "0")}`;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "16px",
        padding: "16px",
      }}
    >
      <Card title="Grid">
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(2, 1fr)",
            gap: "12px",
          }}
        >
          <FormControl label="Rows">
            <input
              type="number"
              min={1}
              value={settings.rows}
              onChange={(event) => updateNumber("rows", event.target.value)}
              style={inputStyle}
            />
          </FormControl>
          <FormControl label="Label spacing (px)">
            <input
              type="number"
              min={0}
              value={settings.iconSpacing}
              onChange={(event) =>
                updateNumber("iconSpacing", event.target.value)
              }
              style={inputStyle}
            />
          </FormControl>
          <FormControl label="Row gutter (px)">
            <input
              type="number"
              min={0}
              value={settings.rowSpacing}
              onChange={(event) =>
                updateNumber("rowSpacing", event.target.value)
              }
              style={inputStyle}
            />
          </FormControl>
          <FormControl label="Column gutter (px)">
            <input
              type="number"
              min={0}
              value={settings.columnSpacing}
              onChange={(event) =>
                updateNumber("columnSpacing", event.target.value)
              }
              style={inputStyle}
            />
          </FormControl>
        </div>
      </Card>

      <Card title="Icon properties">
        <div style={{ display: "flex", gap: "12px", flexDirection: "column" }}>
          <FormControl label="Color">
            <input
              type="color"
              value={colorInputValue}
              onChange={(event) => handleColorChange(event.target.value)}
              style={{
                width: "100%",
                height: "40px",
                borderRadius: "8px",
                border: "1px solid #d1d5db",
                padding: "0 4px",
              }}
              disabled={settings.preserveColors}
            />
          </FormControl>
          <FormControl label="Opacity (%)">
            <input
              type="number"
              min={0}
              max={100}
              value={settings.opacity}
              onChange={(event) => updateNumber("opacity", event.target.value)}
              style={inputStyle}
            />
          </FormControl>
          <FormControl label="Icon size">
            <select
              value={settings.iconSize}
              onChange={(event) => updateNumber("iconSize", event.target.value)}
              style={{ ...inputStyle, appearance: "auto" }}
            >
              {[16, 24, 32, 48].map((size) => (
                <option value={size} key={size}>
                  {size}px
                </option>
              ))}
            </select>
          </FormControl>
        </div>
      </Card>

      <Card title="Content">
        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          <Checkbox
            label="Scale icon content"
            checked={settings.scaleIconContent}
            onChange={(value) => updateBoolean("scaleIconContent", value)}
          />
          <Checkbox
            label="Add metadata"
            checked={settings.addMetaData}
            onChange={(value) => updateBoolean("addMetaData", value)}
          />
          <Checkbox
            label="Preserve original colors"
            checked={settings.preserveColors}
            onChange={(value) => updateBoolean("preserveColors", value)}
          />
        </div>
      </Card>

      <Card title="Label case">
        <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
          {labelCases.map((option) => (
            <label
              key={option.value}
              style={{ display: "flex", gap: "8px", fontSize: "13px" }}
            >
              <input
                type="radio"
                name="label-case"
                value={option.value}
                checked={settings.labelCase === option.value}
                onChange={() => handleLabelCaseChange(option.value)}
              />
              {option.label}
            </label>
          ))}
        </div>
      </Card>

      <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
        <button
          onClick={handleBuild}
          disabled={isLoading || isBuilding}
          style={{
            padding: "12px 16px",
            borderRadius: "8px",
            border: "none",
            fontWeight: 600,
            fontSize: "14px",
            backgroundColor: isLoading || isBuilding ? "#9ca3af" : "#2563eb",
            color: "white",
            cursor: isLoading || isBuilding ? "not-allowed" : "pointer",
          }}
        >
          {isBuilding ? "Building..." : "Build icon grid"}
        </button>
        {statusMessage && (
          <div style={{ fontSize: "12px", color: "#059669" }}>
            {statusMessage}
          </div>
        )}
        {errorMessage && (
          <div style={{ fontSize: "12px", color: "#dc2626" }}>
            {errorMessage}
          </div>
        )}
      </div>
    </div>
  );
}

const labelCases: {
  label: string;
  value: TidyIconCareSettings["labelCase"];
}[] = [
  { label: "lowercase", value: "lowercase" },
  { label: "Sentence case", value: "sentence" },
  { label: "UPPERCASE", value: "uppercase" },
];

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "8px 12px",
  borderRadius: "8px",
  border: "1px solid #d1d5db",
  fontSize: "13px",
};

function serializeSettings(
  settings: TidyIconCareSettings,
): TidyIconCareSettings {
  return {
    ...settings,
    hexColor: settings.hexColor.replace("#", "").toUpperCase(),
  };
}

interface CheckboxProps {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}

function Checkbox({ label, checked, onChange }: CheckboxProps) {
  return (
    <label
      style={{
        display: "flex",
        alignItems: "center",
        gap: "8px",
        fontSize: "13px",
      }}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
      {label}
    </label>
  );
}
