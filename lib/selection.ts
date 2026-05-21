import { DRAKE_DISCOGRAPHY } from '@/lib/discography';
import { trackKey, type Track } from '@/lib/tracks';
import { mentionKey } from '@/lib/mention-key';
import type { Mention, Results } from '@/lib/results';

export interface TrackRef {
  song: string;
  album: string;
}

export interface TrackSelection {
  albums: string[];
  tracks: TrackRef[];
}

export function isEmptySelection(sel: TrackSelection): boolean {
  return sel.albums.length === 0 && sel.tracks.length === 0;
}

export function parseTrackSelection(body: unknown): TrackSelection | null {
  if (!body || typeof body !== 'object') return null;
  const o = body as Record<string, unknown>;

  const albums = Array.isArray(o.albums)
    ? o.albums.filter((a): a is string => typeof a === 'string' && a.length > 0)
    : [];

  const tracks: TrackRef[] = [];
  if (Array.isArray(o.tracks)) {
    for (const item of o.tracks) {
      if (item && typeof item === 'object') {
        const t = item as Record<string, unknown>;
        if (typeof t.song === 'string' && typeof t.album === 'string') {
          tracks.push({ song: t.song, album: t.album });
        }
      }
    }
  }

  if (albums.length === 0 && tracks.length === 0) return null;
  return { albums, tracks };
}

/** Union of explicit tracks and all songs on selected albums. */
export function selectionToTrackKeys(selection: TrackSelection): Set<string> {
  const keys = new Set<string>();

  for (const album of selection.albums) {
    const entry = DRAKE_DISCOGRAPHY.find(a => a.album === album);
    if (entry) {
      for (const song of entry.songs) {
        keys.add(trackKey(song, album));
      }
    }
  }

  for (const { song, album } of selection.tracks) {
    keys.add(trackKey(song, album));
  }

  return keys;
}

export function filterTracks<T extends Track>(tracks: T[], selection: TrackSelection | null): T[] {
  if (!selection || isEmptySelection(selection)) return tracks;
  const keys = selectionToTrackKeys(selection);
  return tracks.filter(t => keys.has(trackKey(t.song, t.album)));
}

export function removeMentionsForTracks(results: Results, refs: Iterable<TrackRef>): void {
  const keys = new Set(
    [...refs].map(r => trackKey(r.song, r.album)),
  );

  for (const friend of Object.keys(results.mentions)) {
    const kept = results.mentions[friend].filter(
      m => !keys.has(trackKey(m.song, m.album)),
    );
    if (kept.length === 0) delete results.mentions[friend];
    else results.mentions[friend] = kept;
  }
}

export function countSongsWithMentions(mentions: Record<string, Mention[]>): number {
  const songs = new Set<string>();
  for (const ms of Object.values(mentions)) {
    for (const m of ms) songs.add(trackKey(m.song, m.album));
  }
  return songs.size;
}

export function seedMentionKeys(results: Results): Set<string> {
  const keys = new Set<string>();
  for (const ms of Object.values(results.mentions)) {
    for (const m of ms) keys.add(mentionKey(m));
  }
  return keys;
}
