export async function mapConcurrent<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;

  async function worker() {
    while (true) {
      const i = next++;
      if (i >= items.length) return;
      results[i] = await fn(items[i]);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, () => worker()),
  );
  return results;
}

export function runExclusive<T>(
  lock: { chain: Promise<void> },
  fn: () => T | Promise<T>,
): Promise<T> {
  const run = lock.chain.then(fn);
  lock.chain = run.then(() => undefined, () => undefined);
  return run;
}
