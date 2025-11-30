import {
  DEFAULT_TIDY_ICON_CARE_SETTINGS,
  TidyIconCareSettings,
  TIDY_ICON_CARE_STORAGE_KEY,
} from "./types";
import { buildIconGrid } from "./utils/buildIconGrid";

export async function tidyIconCareHandler(
  action: string,
  payload: any,
  _figma?: PluginAPI
) {
  switch (action) {
    case "load-params": {
      const settings = await loadSettings();
      return { settings };
    }
    case "save-params": {
      const settings = normalizeSettings(payload?.settings);
      await figma.clientStorage.setAsync(TIDY_ICON_CARE_STORAGE_KEY, settings);
      return { settings };
    }
    case "build-icon-grid": {
      const settings = normalizeSettings(payload?.settings);
      await figma.clientStorage.setAsync(TIDY_ICON_CARE_STORAGE_KEY, settings);
      await buildIconGrid(settings);
      return { settings };
    }
    default:
      throw new Error(`Unknown tidy-icon-care action: ${action}`);
  }
}

async function loadSettings(): Promise<TidyIconCareSettings> {
  const stored = (await figma.clientStorage.getAsync(
    TIDY_ICON_CARE_STORAGE_KEY
  )) as Partial<TidyIconCareSettings> | null;
  return normalizeSettings(stored ?? DEFAULT_TIDY_ICON_CARE_SETTINGS);
}

function normalizeSettings(
  input?: Partial<TidyIconCareSettings>
): TidyIconCareSettings {
  const base = input ?? {};

  const rows = clampNumber(
    base.rows,
    1,
    999,
    DEFAULT_TIDY_ICON_CARE_SETTINGS.rows
  );
  const iconSpacing = clampNumber(
    base.iconSpacing,
    0,
    500,
    DEFAULT_TIDY_ICON_CARE_SETTINGS.iconSpacing
  );
  const rowSpacing = clampNumber(
    base.rowSpacing,
    0,
    500,
    DEFAULT_TIDY_ICON_CARE_SETTINGS.rowSpacing
  );
  const columnSpacing = clampNumber(
    base.columnSpacing,
    0,
    500,
    DEFAULT_TIDY_ICON_CARE_SETTINGS.columnSpacing
  );
  const iconSize = clampNumber(
    base.iconSize,
    8,
    512,
    DEFAULT_TIDY_ICON_CARE_SETTINGS.iconSize
  );
  const opacity = clampNumber(
    base.opacity,
    0,
    100,
    DEFAULT_TIDY_ICON_CARE_SETTINGS.opacity
  );

  const hexColor = sanitizeHex(
    base.hexColor ?? DEFAULT_TIDY_ICON_CARE_SETTINGS.hexColor
  );
  const addMetaData = Boolean(base.addMetaData);
  const scaleIconContent = Boolean(base.scaleIconContent);
  const preserveColors = Boolean(base.preserveColors);

  const allowedCases: TidyIconCareSettings["labelCase"][] = [
    "lowercase",
    "uppercase",
    "sentence",
  ];
  const labelCase = allowedCases.includes(base.labelCase as any)
    ? (base.labelCase as TidyIconCareSettings["labelCase"])
    : DEFAULT_TIDY_ICON_CARE_SETTINGS.labelCase;

  return {
    rows,
    iconSpacing,
    rowSpacing,
    columnSpacing,
    hexColor,
    opacity,
    iconSize,
    addMetaData,
    scaleIconContent,
    preserveColors,
    labelCase,
  };
}

function sanitizeHex(value: string) {
  const candidate = value?.replace(/[^0-9a-fA-F]/g, "").toUpperCase();
  if (!candidate) return DEFAULT_TIDY_ICON_CARE_SETTINGS.hexColor;
  return candidate.slice(0, 8);
}

function clampNumber(
  value: unknown,
  min: number,
  max: number,
  fallback: number
) {
  const num = Number(value);
  if (Number.isFinite(num)) {
    return Math.min(max, Math.max(min, num));
  }
  return fallback;
}
