import fs from 'fs';
import path from 'path';

export interface Mention {
  friend: string;
  bar: string;
  song: string;
  album: string;
  year: number;
}

function normalizeMention(raw: Record<string, unknown>): Mention {
  const friend =
    typeof raw.friend === 'string'
      ? raw.friend
      : typeof raw.figure === 'string'
        ? raw.figure
        : '';
  return {
    friend,
    bar: String(raw.bar ?? ''),
    song: String(raw.song ?? ''),
    album: String(raw.album ?? ''),
    year: Number(raw.year ?? 0),
  };
}

function normalizeResults(data: Results): Results {
  const mentions: Record<string, Mention[]> = {};
  for (const [key, list] of Object.entries(data.mentions)) {
    const normalized = (list as unknown as Record<string, unknown>[]).map(normalizeMention);
    const friendKey = normalized[0]?.friend || key;
    if (!mentions[friendKey]) mentions[friendKey] = [];
    mentions[friendKey].push(...normalized);
  }
  return { ...data, mentions };
}

export interface Results {
  scannedAt: string;
  songsProcessed: number;
  mentions: Record<string, Mention[]>;
}

const RESULTS_PATH = path.join(process.cwd(), 'results.json');

export function readResults(): Results | null {
  try {
    if (!fs.existsSync(RESULTS_PATH)) return null;
    const raw = fs.readFileSync(RESULTS_PATH, 'utf-8');
    return normalizeResults(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function writeResults(data: Results): void {
  fs.writeFileSync(RESULTS_PATH, JSON.stringify(data, null, 2), 'utf-8');
}

export function clearResults(): void {
  if (fs.existsSync(RESULTS_PATH)) {
    fs.unlinkSync(RESULTS_PATH);
  }
}
