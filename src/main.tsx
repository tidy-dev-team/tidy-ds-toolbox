import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { startBridge } from "./shared/operations/ui-bridge-startup";

const rootElement = document.getElementById("root");

if (!rootElement) {
  throw new Error("Root element not found");
}

startBridge();

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
