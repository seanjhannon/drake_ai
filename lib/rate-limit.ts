function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/** Target RPM with headroom under Anthropic org limits (default 50/min). */
function minIntervalMs(): number {
  const rpm = Number(process.env.ANTHROPIC_RPM ?? '50');
  const headroom = 0.9;
  return Math.ceil(60_000 / (rpm * headroom));
}

let queue: Promise<void> = Promise.resolve();
let lastStartedAt = 0;

/** Serialize API calls so concurrent workers stay under the RPM cap. */
export async function withRateLimit<T>(fn: () => Promise<T>): Promise<T> {
  const run = queue.then(async () => {
    const wait = Math.max(0, lastStartedAt + minIntervalMs() - Date.now());
    if (wait > 0) await sleep(wait);
    lastStartedAt = Date.now();
    return fn();
  });
  queue = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

export function isRateLimitError(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String(e);
  return /\b429\b/.test(msg) || /rate_limit/i.test(msg);
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  opts: { maxAttempts?: number; baseDelayMs?: number } = {},
): Promise<T> {
  const maxAttempts = opts.maxAttempts ?? 6;
  const baseDelayMs = opts.baseDelayMs ?? 2000;

  let lastError: unknown;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (e: unknown) {
      lastError = e;
      if (!isRateLimitError(e) || attempt === maxAttempts - 1) throw e;
      const delay = Math.min(60_000, baseDelayMs * Math.pow(2, attempt));
      await sleep(delay);
    }
  }
  throw lastError;
}
