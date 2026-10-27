/**
 * Calls `fn` up to `attempts` times with exponential backoff. Errors for which
 * `isFatal` returns true are rethrown immediately (e.g. a guardrail verdict).
 */
export async function withRetries<T>(
  fn: () => Promise<T>,
  options: { attempts?: number; baseDelayMs?: number; isFatal?: (err: unknown) => boolean } = {},
): Promise<T> {
  const { attempts = 3, baseDelayMs = 500, isFatal = () => false } = options;
  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (isFatal(err)) throw err;
      lastError = err;
      if (attempt < attempts) {
        await new Promise((resolve) => setTimeout(resolve, baseDelayMs * 2 ** (attempt - 1)));
      }
    }
  }
  throw lastError;
}
