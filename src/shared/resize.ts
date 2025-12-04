export const RESIZE_DEFAULT = {
  width: 840,
  height: 648,
};

export const RESIZE_LIMITS = {
  MIN_WIDTH: 640,
  MAX_WIDTH: 1280,
  MIN_HEIGHT: 480,
  MAX_HEIGHT: 1000,
};

export const RESIZE_THROTTLE_MS = 80;

export function clampSize(width: number, height: number) {
  const roundedWidth = Math.round(width);
  const roundedHeight = Math.round(height);

  const nextWidth = Math.min(
    Math.max(roundedWidth, RESIZE_LIMITS.MIN_WIDTH),
    RESIZE_LIMITS.MAX_WIDTH,
  );
  const nextHeight = Math.min(
    Math.max(roundedHeight, RESIZE_LIMITS.MIN_HEIGHT),
    RESIZE_LIMITS.MAX_HEIGHT,
  );

  return { width: nextWidth, height: nextHeight };
}
