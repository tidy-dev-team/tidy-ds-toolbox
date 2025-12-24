/**
 * Constants for the Audit plugin
 */

export const REPORT_FRAME_WIDTH = 1920;

export const TEXT_WIDTH = 464;

export const REPORT_PAGE = "📊 Audit result";

export const PLUGIN_DATA_NAMESPACE = "audit";

export const ALLOWED_TYPES = [
  "FRAME",
  "INSTANCE",
  "COMPONENT",
  "COMPONENT_SET",
  "GROUP",
];

export const ERROR_COLOR: Paint[] = [
  {
    type: "SOLID",
    visible: true,
    opacity: 1,
    blendMode: "NORMAL",
    color: {
      r: 1,
      g: 0,
      b: 0,
    },
  },
];

export const SEVERITY_LEVELS = {
  CRITICAL: {
    name: "Critical",
    symbol: "🟥",
    value: 4,
  },
  HIGH: {
    name: "High",
    symbol: "🟧",
    value: 3,
  },
  MEDIUM: {
    name: "Medium",
    symbol: "🟨",
    value: 2,
  },
  LOW: {
    name: "Low",
    symbol: "🟩",
    value: 1,
  },
} as const;

// Severity colors for frames (strokes)
export const SEVERITY_STROKE_COLORS: Record<string, RGB> = {
  critical: { r: 1, g: 0, b: 0 },
  high: { r: 1, g: 0.7139676809310913, b: 0.3781901001930237 },
  medium: { r: 1, g: 0.8399999737739563, b: 0 },
  low: { r: 0.8213211297988892, g: 0.9839518070220947, b: 0.864689290523529 },
};

// Severity colors for notes (fills)
export const SEVERITY_FILL_COLORS: Record<string, RGB> = {
  critical: {
    r: 0.9960784316062927,
    g: 0.8549019694328308,
    b: 0.8078431487083435,
  },
  high: { r: 0.9958170652389526, g: 0.8284225463867188, b: 0.6319159269332886 },
  medium: {
    r: 0.9806478023529053,
    g: 0.9118025898933411,
    b: 0.6677151322364807,
  },
  low: { r: 0.8213211297988892, g: 0.9839518070220947, b: 0.864689290523529 },
};

// Counter colors (hex)
export const COUNTER_COLORS: Record<string, string> = {
  low: "52CE50",
  medium: "F5EF4B",
  high: "F5AE4B",
  critical: "FF0000",
};
