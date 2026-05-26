import { NextRequest, NextResponse } from 'next/server';
import { demoModeJson, isDemoMode } from '@/lib/demo-mode';
import { mentionKey } from '@/lib/mention-key';
import { getTrackLyrics } from '@/lib/lyrics';
import { addManualMention } from '@/lib/results';
import { upsertReview } from '@/lib/reviews';
import { buildTrackList } from '@/lib/tracks';

function resolveYear(song: string, album: string, yearFromBody: number): number {
  if (yearFromBody > 0) return yearFromBody;
  const fromLyrics = getTrackLyrics(song, album);
  if (fromLyrics) return fromLyrics.year;
  const fromCatalog = buildTrackList().find(t => t.song === song && t.album === album);
  return fromCatalog?.year ?? 0;
}

export async function POST(request: NextRequest) {
  if (isDemoMode()) return demoModeJson();
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const friend = typeof body.friend === 'string' ? body.friend.trim() : '';
  const bar = typeof body.bar === 'string' ? body.bar.trim() : '';
  const song = typeof body.song === 'string' ? body.song : '';
  const album = typeof body.album === 'string' ? body.album : '';
  const year = typeof body.year === 'number' ? body.year : Number(body.year) || 0;

  if (!friend || !bar || !song || !album) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }

  const mention = {
    friend,
    bar,
    song,
    album,
    year: resolveYear(song, album, year),
  };

  const { added, mention: saved } = addManualMention(mention);
  if (!added) {
    return NextResponse.json({ error: 'duplicate' }, { status: 409 });
  }

  const key = mentionKey(saved);
  const review = upsertReview({
    mentionKey: key,
    status: 'correct',
    friend: saved.friend,
    bar: saved.bar,
    song: saved.song,
    album: saved.album,
    year: saved.year,
  });

  return NextResponse.json({ ok: true, mention: saved, review });
}
