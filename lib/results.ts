import fs from 'fs';
import path from 'path';

export interface Mention {
  figure: string;
  bar: string;
  song: string;
  album: string;
  year: number;
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
    return JSON.parse(raw);
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
