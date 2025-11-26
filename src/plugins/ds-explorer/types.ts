// DS Explorer module types

export interface ComponentInfo {
  key: string;
  name: string;
  type?: string;
}

export interface ComponentRegistry {
  [key: string]: ComponentInfo;
}

export interface PropertyInfo {
  name: string;
  type: "VARIANT" | "TEXT" | "INSTANCE_SWAP" | "BOOLEAN";
  defaultValue?: any;
  variantOptions?: string[];
}

export interface PropertyStates {
  [propertyKey: string]: boolean;
}

export interface ComponentData {
  properties: PropertyInfo[];
  nestedInstances: { name: string; id: string; key: string }[];
  description: string;
  image: string | null;
}

export interface BuildData {
  [propertyKey: string]: boolean | string | undefined;
  componentKey?: string;
}
