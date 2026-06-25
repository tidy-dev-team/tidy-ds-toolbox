import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { startBridge } from "./shared/operations/ui-bridge-startup";
import { startUsageTransport } from "./shared/analytics/transport";

const rootElement = document.getElementById("root");

if (!rootElement) {
  throw new Error("Root element not found");
}

startBridge();
startUsageTransport();

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
