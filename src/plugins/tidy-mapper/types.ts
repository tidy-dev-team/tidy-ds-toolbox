// Tidy Mapper module types

export interface SliceData {
  raster: FrameNode;
  trail: FrameNode;
}

export type TidyMapperAction =
  | "grab-slices"
  | "set-slice-name"
  | "show-trails"
  | "show-chosen"
  | "get-trail-names"
  | "get-current-name";

// Payload types
export interface SetSliceNamePayload {
  name: string;
}

export interface ShowTrailsPayload {
  visible: boolean;
}

export interface ShowChosenPayload {
  name: string;
}

// Response types
export interface GrabSlicesResult {
  success: boolean;
  count: number;
  message: string;
}

export interface TrailNamesResult {
  names: string[];
}

export interface CurrentNameResult {
  name: string;
}
