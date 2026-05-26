/** Client-side stream replay (Vercel demo — no live LLM). */
export const DEMO_LYRICS_URL = '/data/demo-lyrics.jsonl';
export const DEMO_SCAN_URL = '/data/demo-scan.jsonl';

export const isClientDemoMode =
  process.env.NEXT_PUBLIC_DEMO_MODE === 'true';

/** Per-event delay — keep full-catalog replays under ~10s each. */
export const DEMO_LYRICS_REPLAY_MS = 14;
export const DEMO_SCAN_REPLAY_MS = 22;

export type ScanStreamEvent = Record<string, unknown>;

export async function fetchDemoReplayEvents(url: string): Promise<ScanStreamEvent[]> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Could not load demo replay (${res.status})`);
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

export function fetchDemoLyricsEvents(): Promise<ScanStreamEvent[]> {
  return fetchDemoReplayEvents(DEMO_LYRICS_URL);
}

export function fetchDemoScanEvents(): Promise<ScanStreamEvent[]> {
  return fetchDemoReplayEvents(DEMO_SCAN_URL);
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
