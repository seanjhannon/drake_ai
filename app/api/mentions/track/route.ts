import { NextRequest, NextResponse } from 'next/server';
import { mentionKey } from '@/lib/mention-key';
import { getMentionsForTrack, readResults } from '@/lib/results';

export async function GET(request: NextRequest) {
  const song = request.nextUrl.searchParams.get('song');
  const album = request.nextUrl.searchParams.get('album');

  if (!song || !album) {
    return NextResponse.json({ error: 'Missing song or album' }, { status: 400 });
  }

  const results = readResults();
  const mentions = results ? getMentionsForTrack(results, song, album) : [];

  return NextResponse.json({
    mentions: mentions.map(m => ({
      ...m,
      mentionKey: mentionKey(m),
    })),
  });
}
