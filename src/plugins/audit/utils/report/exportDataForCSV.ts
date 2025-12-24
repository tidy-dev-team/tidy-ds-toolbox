/**
 * Export data for CSV
 */

import { PLUGIN_DATA_NAMESPACE } from "../constants";
import type { CsvData } from "../../types";

export function exportDataForCSV(): CsvData {
  const document = figma.root;
  const savedData: CsvData = {};
  const keys = document.getSharedPluginDataKeys(PLUGIN_DATA_NAMESPACE);

  for (const key of keys) {
    const value = document.getSharedPluginData(PLUGIN_DATA_NAMESPACE, key);
    if (value) {
      try {
        const textContentJSON = JSON.parse(value);
        savedData[key] = textContentJSON;
      } catch {
        // Skip invalid JSON
      }
    }
  }

  return savedData;
}
