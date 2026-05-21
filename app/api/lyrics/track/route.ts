import { NextRequest, NextResponse } from 'next/server';
import { getTrackLyrics } from '@/lib/lyrics';

export async function GET(request: NextRequest) {
  const song = request.nextUrl.searchParams.get('song');
  const album = request.nextUrl.searchParams.get('album');

  if (!song || !album) {
    return NextResponse.json({ error: 'Missing song or album' }, { status: 400 });
  }

  const track = getTrackLyrics(song, album);
  if (!track) {
    return NextResponse.json({ error: 'Lyrics not found' }, { status: 404 });
  }

  const lines = track.lyrics
    .split('\n')
    .map(l => l.trim())
    .filter(l => l.length > 0);

  return NextResponse.json({
    song: track.song,
    album: track.album,
    year: track.year,
    lyrics: track.lyrics,
    lines,
  });
}
