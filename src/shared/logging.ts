export const DEBUG_LOGGING_ENABLED = false;

export function debugLog(...args: any[]) {
  if (!DEBUG_LOGGING_ENABLED) {
    return;
  }
  // eslint-disable-next-line no-console
  console.log(...args);
}
