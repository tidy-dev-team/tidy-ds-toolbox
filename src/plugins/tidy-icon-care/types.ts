export type LabelCase = "lowercase" | "uppercase" | "sentence";

export interface TidyIconCareSettings {
  rows: number;
  iconSpacing: number;
  rowSpacing: number;
  columnSpacing: number;
  hexColor: string; // stored without leading #
  opacity: number; // percentage 0-100
  iconSize: number; // pixels
  addMetaData: boolean;
  scaleIconContent: boolean;
  preserveColors: boolean;
  labelCase: LabelCase;
}

export interface BuildIconGridPayload {
  settings: TidyIconCareSettings;
}

export type TidyIconCareAction =
  | "load-params"
  | "save-params"
  | "build-icon-grid";

export interface TidyIconCareResponse<T = any> {
  success: boolean;
  data?: T;
}

export const TIDY_ICON_CARE_STORAGE_KEY = "tidy-icon-care-settings";

export const DEFAULT_TIDY_ICON_CARE_SETTINGS: TidyIconCareSettings = {
  rows: 10,
  iconSpacing: 10,
  rowSpacing: 16,
  columnSpacing: 36,
  hexColor: "0D0C0C",
  opacity: 100,
  iconSize: 24,
  addMetaData: false,
  scaleIconContent: false,
  preserveColors: false,
  labelCase: "lowercase",
};
