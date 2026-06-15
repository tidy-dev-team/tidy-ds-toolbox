// Icon Finder module types

export type IconFinderAction = "start" | "stop";

export interface AnalyzedNode {
  id: string;
  name: string;
  type: string;
  png: string; // base64-encoded PNG
}

export interface AnalyzePngMessage {
  type: "analyze-png";
  payload: {
    nodes: AnalyzedNode[];
  };
}

export interface NoSelectionMessage {
  type: "no-selection";
}

export interface LoadingMessage {
  type: "loading";
}

export type IconFinderShellMessage =
  | AnalyzePngMessage
  | NoSelectionMessage
  | LoadingMessage;
