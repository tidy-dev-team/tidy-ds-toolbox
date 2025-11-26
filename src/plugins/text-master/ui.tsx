import React, { useState } from "react";
import { Card, FormControl } from "@shell/components";
import { insertText } from "@shared/bridge";

const TEXT_PRESETS = {
  short: "Lorem ipsum dolor sit amet",
  long: "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.",
  heading: "Main Heading",
  subheading: "Subheading Text",
};

export function TextMasterUI() {
  const [customText, setCustomText] = useState("");
  const [status, setStatus] = useState("");

  const handlePresetClick = (preset: keyof typeof TEXT_PRESETS) => {
    const text = TEXT_PRESETS[preset];
    setStatus("Inserting text...");
    insertText(text);
    setStatus(`Inserted ${preset} text successfully!`);
    setTimeout(() => setStatus(""), 3000);
  };

  const handleCustomInsert = () => {
    if (!customText.trim()) {
      setStatus("Please enter some text");
      return;
    }

    setStatus("Inserting custom text...");
    insertText(customText);
    setStatus("Custom text inserted successfully!");
    setTimeout(() => setStatus(""), 3000);
  };

  return (
    <div>
      <h2>Text Master</h2>

      <Card title="Text Presets">
        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
          <button onClick={() => handlePresetClick("short")}>Short Text</button>
          <button onClick={() => handlePresetClick("long")}>Long Text</button>
          <button onClick={() => handlePresetClick("heading")}>Heading</button>
          <button onClick={() => handlePresetClick("subheading")}>
            Subheading
          </button>
        </div>
      </Card>

      <Card title="Custom Text">
        <FormControl label="Enter your text">
          <textarea
            value={customText}
            onChange={(e) => setCustomText(e.target.value)}
            rows={5}
            placeholder="Type your custom text here..."
            style={{ width: "100%", padding: "8px" }}
          />
        </FormControl>
        <button onClick={handleCustomInsert} style={{ marginTop: "10px" }}>
          Insert Custom Text
        </button>
      </Card>

      {status && (
        <div
          style={{
            marginTop: "10px",
            padding: "10px",
            background: "#e3f2fd",
            borderRadius: "4px",
          }}
        >
          {status}
        </div>
      )}
    </div>
  );
}
