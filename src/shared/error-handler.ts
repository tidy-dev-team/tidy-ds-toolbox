/**
 * Custom error types for the plugin
 */
export class PluginError extends Error {
  constructor(
    message: string,
    public code: string,
    public module: string,
    public recoverable: boolean = true
  ) {
    super(message);
    this.name = "PluginError";
  }
}

export class TimeoutError extends PluginError {
  constructor(operation: string, timeoutMs: number) {
    super(
      `Operation '${operation}' timed out after ${timeoutMs}ms`,
      "TIMEOUT",
      "system",
      true
    );
    this.name = "TimeoutError";
  }
}

/**
 * Wraps a promise with a timeout
 * @param promise The promise to wrap
 * @param timeoutMs Timeout in milliseconds
 * @param operation Description of the operation for error messages
 * @returns The promise result or throws TimeoutError
 */
export async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  operation: string
): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout>;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new TimeoutError(operation, timeoutMs));
    }, timeoutMs);
  });

  try {
    const result = await Promise.race([promise, timeoutPromise]);
    clearTimeout(timeoutId!);
    return result;
  } catch (error) {
    clearTimeout(timeoutId!);
    throw error;
  }
}

/**
 * Wraps a function with retry logic
 * @param fn Function to retry
 * @param maxRetries Maximum number of retries
 * @param delayMs Delay between retries in milliseconds
 * @returns The function result
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  delayMs: number = 1000
): Promise<T> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;

      if (attempt < maxRetries) {
        // Wait before retrying
        await new Promise((resolve) => setTimeout(resolve, delayMs));
        console.warn(`Retry attempt ${attempt + 1}/${maxRetries}:`, error);
      }
    }
  }

  throw lastError;
}

/**
 * Formats an error for user display
 */
export function formatErrorMessage(error: unknown): string {
  if (error instanceof PluginError) {
    return error.message;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

/**
 * Determines if an error is recoverable
 */
export function isRecoverableError(error: unknown): boolean {
  if (error instanceof PluginError) {
    return error.recoverable;
  }

  // Network errors, timeouts are generally recoverable
  if (error instanceof TimeoutError) {
    return true;
  }

  // Unknown errors are assumed non-recoverable
  return false;
}
