import fs from 'fs';
import path from 'path';
import { TOTAL_SONGS } from '@/lib/discography';
import { buildTrackList, trackKey, type Track } from '@/lib/tracks';

const LYRICS_PATH = path.join(process.cwd(), 'data', 'lyrics.json');

export interface StoredTrack extends Track {
  lyrics: string | null;
  lineCount: number;
}

export interface LyricsStore {
  syncedAt: string;
  totalSongs: number;
  parsed: number;
  failed: number;
  tracks: StoredTrack[];
  failedSongs: Array<{ song: string; album: string }>;
}

function ensureDataDir(): void {
  const dir = path.dirname(LYRICS_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

export function readLyrics(): LyricsStore | null {
  try {
    if (!fs.existsSync(LYRICS_PATH)) return null;
    const raw = fs.readFileSync(LYRICS_PATH, 'utf-8');
    return JSON.parse(raw) as LyricsStore;
  } catch {
    return null;
  }
}

export function writeLyrics(data: LyricsStore): void {
  ensureDataDir();
  fs.writeFileSync(LYRICS_PATH, JSON.stringify(data, null, 2), 'utf-8');
}

export function clearLyrics(): void {
  if (fs.existsSync(LYRICS_PATH)) fs.unlinkSync(LYRICS_PATH);
}

export function createEmptyLyricsStore(): LyricsStore {
  const store: LyricsStore = {
    syncedAt: new Date().toISOString(),
    totalSongs: TOTAL_SONGS,
    parsed: 0,
    failed: 0,
    tracks: buildTrackList().map(t => ({
      ...t,
      lyrics: null,
      lineCount: 0,
    })),
    failedSongs: [],
  };
  recomputeLyricsCounts(store);
  return store;
}

/** Merge catalog changes (new songs) into an existing on-disk store. */
export function ensureStoreTracks(store: LyricsStore): void {
  const byKey = new Map(store.tracks.map(t => [trackKey(t.song, t.album), t]));
  store.tracks = buildTrackList().map(t => {
    const existing = byKey.get(trackKey(t.song, t.album));
    return existing
      ? { ...existing, index: t.index, album: t.album, year: t.year }
      : { ...t, lyrics: null, lineCount: 0 };
  });
  store.totalSongs = TOTAL_SONGS;
  recomputeLyricsCounts(store);
}

export function getTracksWithLyrics(store: LyricsStore): Array<Track & { lyrics: string }> {
  return store.tracks
    .filter((t): t is StoredTrack & { lyrics: string } => t.lyrics !== null && t.lyrics.length > 0)
    .map(({ index, song, album, year, lyrics }) => ({ index, song, album, year, lyrics }));
}

function stripTimestamps(lyrics: string): string {
  return lyrics
    .replace(/\[\d{2}:\d{2}\.\d{2,3}\]/g, '')
    .split('\n')
    .map(l => l.trim())
    .filter(l => l.length > 0)
    .join('\n');
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function fetchLyricsFromApi(song: string, album: string): Promise<string | null> {
  const encodedSong = encodeURIComponent(song);
  const encodedAlbum = encodeURIComponent(album);

  const attempts = [
    `https://lrclib.net/api/get?artist_name=Drake&track_name=${encodedSong}&album_name=${encodedAlbum}`,
    `https://lrclib.net/api/get?artist_name=Drake&track_name=${encodedSong}`,
  ];

  for (const url of attempts) {
    for (let retry = 0; retry < 3; retry++) {
      try {
        const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
        if (res.ok) {
          const data = await res.json();
          const lyrics =
            data.plainLyrics || (data.syncedLyrics ? stripTimestamps(data.syncedLyrics) : null);
          if (lyrics && lyrics.trim().length > 0) return lyrics;
        } else if (res.status === 404) {
          break;
        }
      } catch {
        if (retry < 2) await sleep(400);
      }
    }
  }

  try {
    const searchUrl = `https://lrclib.net/api/search?artist_name=Drake&track_name=${encodedSong}`;
    const res = await fetch(searchUrl, { signal: AbortSignal.timeout(8000) });
    if (res.ok) {
      const searchResults = await res.json();
      if (Array.isArray(searchResults) && searchResults.length > 0) {
        const match = searchResults[0];
        const lyrics =
          match.plainLyrics || (match.syncedLyrics ? stripTimestamps(match.syncedLyrics) : null);
        if (lyrics) return lyrics;
      }
    }
  } catch {}

  return null;
}

/** Apply fetched lyrics for one track and recompute store counters. */
export function applyLyricsToStore(
  store: LyricsStore,
  track: Track,
  lyrics: string | null,
): { ok: boolean; lineCount: number } {
  const key = trackKey(track.song, track.album);
  const idx = store.tracks.findIndex(t => trackKey(t.song, t.album) === key);
  if (idx < 0) return { ok: false, lineCount: 0 };

  const hasLyrics = lyrics !== null && lyrics.length > 0;
  const lineCount = hasLyrics ? lyrics.split('\n').length : 0;
  store.tracks[idx] = { ...store.tracks[idx], lyrics, lineCount };
  recomputeLyricsCounts(store);
  return { ok: hasLyrics, lineCount };
}

export function recomputeLyricsCounts(store: LyricsStore): void {
  store.parsed = store.tracks.filter(t => t.lyrics && t.lyrics.length > 0).length;
  store.failed = store.totalSongs - store.parsed;
  store.failedSongs = store.tracks
    .filter(t => !t.lyrics || t.lyrics.length === 0)
    .map(t => ({ song: t.song, album: t.album }));
}
