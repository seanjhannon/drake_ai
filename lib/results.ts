import fs from 'fs';
import path from 'path';
import { mentionKey } from '@/lib/mention-key';
import { countSongsWithMentions } from '@/lib/selection';
import { trackKey } from '@/lib/tracks';

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

export function getMentionsForTrack(results: Results, song: string, album: string): Mention[] {
  const key = trackKey(song, album);
  const out: Mention[] = [];
  for (const list of Object.values(results.mentions)) {
    for (const m of list) {
      if (trackKey(m.song, m.album) === key) out.push(m);
    }
  }
  return out;
}

function emptyResults(): Results {
  return {
    scannedAt: new Date().toISOString(),
    songsProcessed: 0,
    mentions: {},
  };
}

export function addManualMention(
  mention: Mention,
): { added: boolean; mention: Mention } {
  const results = readResults() ?? emptyResults();
  const key = mentionKey(mention);

  for (const list of Object.values(results.mentions)) {
    for (const m of list) {
      if (mentionKey(m) === key) {
        return { added: false, mention: m };
      }
    }
  }

  if (!results.mentions[mention.friend]) {
    results.mentions[mention.friend] = [];
  }
  results.mentions[mention.friend].push(mention);
  results.scannedAt = new Date().toISOString();
  results.songsProcessed = countSongsWithMentions(results.mentions);
  writeResults(results);
  return { added: true, mention };
}
