/**
 * Logging system for the plugin
 * Supports multiple log levels and can be configured via environment or runtime
 */

export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
  NONE = 4,
}

interface LogConfig {
  level: LogLevel;
  enableTimestamps: boolean;
  enableModuleNames: boolean;
}

// Default configuration - can be overridden
let config: LogConfig = {
  level: LogLevel.WARN, // Only show warnings and errors by default
  enableTimestamps: true,
  enableModuleNames: true,
};

/**
 * Configure the logging system
 */
export function configureLogging(options: Partial<LogConfig>): void {
  config = { ...config, ...options };
}

/**
 * Enable debug logging (useful for development)
 */
export function enableDebugLogging(): void {
  config.level = LogLevel.DEBUG;
}

/**
 * Disable all logging
 */
export function disableLogging(): void {
  config.level = LogLevel.NONE;
}

/**
 * Format log message with metadata
 */
function formatMessage(
  level: string,
  module: string | undefined,
  message: string
): string {
  const parts: string[] = [];

  if (config.enableTimestamps) {
    parts.push(`[${new Date().toISOString().split("T")[1].split(".")[0]}]`);
  }

  parts.push(`[${level}]`);

  if (config.enableModuleNames && module) {
    parts.push(`[${module}]`);
  }

  parts.push(message);

  return parts.join(" ");
}

/**
 * Generic log function
 */
function log(
  level: LogLevel,
  levelName: string,
  module: string | undefined,
  message: string,
  data?: unknown
): void {
  if (config.level > level) {
    return;
  }

  const formattedMessage = formatMessage(levelName, module, message);

  switch (level) {
    case LogLevel.DEBUG:
    case LogLevel.INFO:
      console.log(formattedMessage, data !== undefined ? data : "");
      break;
    case LogLevel.WARN:
      console.warn(formattedMessage, data !== undefined ? data : "");
      break;
    case LogLevel.ERROR:
      console.error(formattedMessage, data !== undefined ? data : "");
      break;
  }
}

/**
 * Logger class for module-specific logging
 */
export class Logger {
  constructor(private moduleName: string) {}

  debug(message: string, data?: unknown): void {
    log(LogLevel.DEBUG, "DEBUG", this.moduleName, message, data);
  }

  info(message: string, data?: unknown): void {
    log(LogLevel.INFO, "INFO", this.moduleName, message, data);
  }

  warn(message: string, data?: unknown): void {
    log(LogLevel.WARN, "WARN", this.moduleName, message, data);
  }

  error(message: string, data?: unknown): void {
    log(LogLevel.ERROR, "ERROR", this.moduleName, message, data);
  }
}

/**
 * Create a logger for a specific module
 */
export function createLogger(moduleName: string): Logger {
  return new Logger(moduleName);
}

/**
 * Legacy function for backward compatibility
 * @deprecated Use createLogger().debug() instead
 */
export function debugLog(...args: unknown[]): void {
  if (config.level <= LogLevel.DEBUG) {
    console.log(...args);
  }
}
