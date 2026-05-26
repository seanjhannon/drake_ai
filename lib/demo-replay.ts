/** Client-side scan replay (Vercel demo — no live LLM). */
export const DEMO_SCAN_URL = '/data/demo-scan.jsonl';

export const isClientDemoMode =
  process.env.NEXT_PUBLIC_DEMO_MODE === 'true';

/** Delay between replay events (ms). */
export const DEMO_REPLAY_EVENT_MS = 55;

export type ScanStreamEvent = Record<string, unknown>;

export async function fetchDemoScanEvents(): Promise<ScanStreamEvent[]> {
  const res = await fetch(DEMO_SCAN_URL);
  if (!res.ok) {
    throw new Error(`Could not load demo scan (${res.status})`);
  }
  const text = await res.text();
  const events: ScanStreamEvent[] = [];
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    events.push(JSON.parse(trimmed) as ScanStreamEvent);
  }
  return events;
}

export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException('Aborted', 'AbortError'));
      return;
    }
    const id = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(id);
      reject(new DOMException('Aborted', 'AbortError'));
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}
