/**
 * Build layout frames for report sections
 */

import { addSectionTitle } from "./addSectionTitle";
import { buildAutoLayoutFrame } from "./buildAutoLayoutFrame";
import { PLUGIN_DATA_NAMESPACE } from "../constants";

interface LayoutFrames {
  criticalFrame: FrameNode | null;
  reportFrame: FrameNode;
  highFrame: FrameNode | null;
  mediumFrame: FrameNode | null;
  lowFrame: FrameNode | null;
  quickWinFrame: FrameNode | null;
}

export function buildLayoutFrames(keys: string[]): LayoutFrames {
  const quickWins = keys
    .map((key) => {
      const value = figma.root.getSharedPluginData(PLUGIN_DATA_NAMESPACE, key);
      if (!value) return null;
      try {
        const textContentJSON = JSON.parse(value);
        return textContentJSON.quickWin ? key : null;
      } catch {
        return null;
      }
    })
    .filter((key): key is string => key !== null);

  const criticalKeys = keys.filter((key) => key.includes("critical"));
  const highKeys = keys.filter((key) => key.includes("high"));
  const mediumKeys = keys.filter((key) => key.includes("medium"));
  const lowKeys = keys.filter((key) => key.includes("low"));

  const isQuickWins = quickWins.length > 0;
  const isCritical = criticalKeys.length > 0;
  const isHigh = highKeys.length > 0;
  const isMedium = mediumKeys.length > 0;
  const isLow = lowKeys.length > 0;

  const reportFrame = buildAutoLayoutFrame(
    "report-frame",
    "HORIZONTAL",
    0,
    0,
    120,
  );
  reportFrame.fills = [];

  const quickWinFrame = isQuickWins
    ? buildAutoLayoutFrame("report-quick-wins", "VERTICAL", 100, 100, 86)
    : null;
  if (quickWinFrame) addSectionTitle("Quick Wins", quickWinFrame, quickWins);

  const criticalFrame = isCritical
    ? buildAutoLayoutFrame("report-critical", "VERTICAL", 100, 100, 86)
    : null;
  if (criticalFrame) addSectionTitle("Critical", criticalFrame, criticalKeys);

  const highFrame = isHigh
    ? buildAutoLayoutFrame("report-high", "VERTICAL", 100, 100, 86)
    : null;
  if (highFrame) addSectionTitle("High", highFrame, highKeys);

  const mediumFrame = isMedium
    ? buildAutoLayoutFrame("report-medium", "VERTICAL", 100, 100, 86)
    : null;
  if (mediumFrame) addSectionTitle("Medium", mediumFrame, mediumKeys);

  const lowFrame = isLow
    ? buildAutoLayoutFrame("report-low", "VERTICAL", 100, 100, 86)
    : null;
  if (lowFrame) addSectionTitle("Low", lowFrame, lowKeys);

  return {
    criticalFrame,
    reportFrame,
    highFrame,
    mediumFrame,
    lowFrame,
    quickWinFrame,
  };
}
