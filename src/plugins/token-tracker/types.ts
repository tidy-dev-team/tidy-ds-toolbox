// Token Tracker module types

export interface RGBA {
  r: number;
  g: number;
  b: number;
  a: number;
}

export interface ColorVariable {
  id: string;
  name: string;
  resolvedType: string;
  valuesByMode: { [key: string]: RGBA | string };
  defaultModeId: string;
  modes: { id: string; name: string }[];
  description: string;
  isLocal: boolean;
  libraryName?: string;
}

export interface VariableCollection {
  id: string;
  name: string;
}

export interface Page {
  id: string;
  name: string;
}

export interface BoundNodeInfo {
  node: SceneNode;
  boundProperties: string[];
  propertyPath: string;
  pageName: string;
}

export interface SearchCallbacks {
  onProgress?: (current: number, total: number, nodesFound: number) => void;
  onStreamingResult?: (result: {
    variableId: string;
    variableName: string;
    instanceNode: {
      id: string;
      name: string;
      type: string;
      pageName: string;
    };
  }) => void;
  shouldCancel?: () => boolean;
}

export interface SearchProgress {
  current: number;
  total: number;
  percentage: number;
  nodesFound: number;
  currentVariableName?: string;
  currentVariableIndex?: number;
  totalVariables?: number;
}

export interface StreamingResult {
  variableId: string;
  variableName: string;
  instanceNode: {
    id: string;
    name: string;
    type: string;
    pageName: string;
  };
}

export interface VariableResult {
  variable: Variable;
  boundNodes: BoundNodeInfo[];
  summary: {
    totalNodes: number;
    nodesByType: Record<string, number>;
    propertyUsage: Record<string, number>;
  };
  instancesOnly: boolean;
}

// Message payload types
export interface GetCollectionsPayload {}

export interface GetPagesPayload {}

export interface GetColorVariablesPayload {
  collectionId: string | null;
}

export interface FindBoundNodesPayload {
  variableIds: string[];
  pageId?: string | null;
}

export interface CancelSearchPayload {}
