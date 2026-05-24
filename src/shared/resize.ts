export const RESIZE_DEFAULT = {
  width: 1024,
  height: 768,
};

export const RESIZE_BRIDGE = {
  width: 240,
  height: 56,
};

export const RESIZE_LIMITS = {
  MIN_WIDTH: 400,
  MAX_WIDTH: 1280,
  MIN_HEIGHT: 640,
  MAX_HEIGHT: 1000,
};

export const RESIZE_BRIDGE_LIMITS = {
  MIN_WIDTH: 200,
  MAX_WIDTH: 400,
  MIN_HEIGHT: 48,
  MAX_HEIGHT: 120,
};

export const RESIZE_THROTTLE_MS = 80;

export type ResizeMode = "default" | "bridge";

export function clampSize(
  width: number,
  height: number,
  mode: ResizeMode = "default",
) {
  const limits = mode === "bridge" ? RESIZE_BRIDGE_LIMITS : RESIZE_LIMITS;
  const roundedWidth = Math.round(width);
  const roundedHeight = Math.round(height);

  const nextWidth = Math.min(
    Math.max(roundedWidth, limits.MIN_WIDTH),
    limits.MAX_WIDTH,
  );
  const nextHeight = Math.min(
    Math.max(roundedHeight, limits.MIN_HEIGHT),
    limits.MAX_HEIGHT,
  );

  return { width: nextWidth, height: nextHeight };
}
