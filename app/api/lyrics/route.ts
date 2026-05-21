import { NextRequest, NextResponse } from 'next/server';
import { TOTAL_SONGS } from '@/lib/discography';
import { mapConcurrent, runExclusive } from '@/lib/concurrent';
import {
  applyLyricsToStore,
  clearLyrics,
  createEmptyLyricsStore,
  fetchLyricsFromApi,
  readLyrics,
  writeLyrics,
  type LyricsStore,
} from '@/lib/lyrics';
import { filterTracks, parseTrackSelection } from '@/lib/selection';
import { formatScanEvent } from '@/lib/scan-log';
import { buildTrackList, trackKey } from '@/lib/tracks';

export const maxDuration = 300;
export const dynamic = 'force-dynamic';

const LYRICS_CONCURRENCY = 15;

export async function GET() {
  const store = readLyrics();
  if (!store) {
    return NextResponse.json({ exists: false, totalSongs: TOTAL_SONGS });
  }
  const trackLyrics: Record<string, boolean> = {};
  for (const t of store.tracks) {
    trackLyrics[trackKey(t.song, t.album)] = !!(t.lyrics && t.lyrics.length > 0);
  }

  return NextResponse.json({
    exists: true,
    data: {
      syncedAt: store.syncedAt,
      totalSongs: store.totalSongs,
      parsed: store.parsed,
      failed: store.failed,
      failedSongs: store.failedSongs,
      trackLyrics,
    },
  });
}

export async function DELETE() {
  clearLyrics();
  return NextResponse.json({ ok: true });
}

export async function POST(request: NextRequest) {
  let selection = null;
  const contentType = request.headers.get('content-type') ?? '';
  if (contentType.includes('application/json')) {
    try {
      const body = await request.json();
      selection = parseTrackSelection(body);
    } catch {
      // ignore malformed body
    }
  }

  const scoped = selection !== null;
  const allTracks = buildTrackList();
  const tracks = filterTracks(allTracks, selection);
  const total = tracks.length;

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      function send(obj: object) {
        const line = formatScanEvent(obj as Record<string, unknown>);
        if (line) console.log(`[lyrics] ${line}`);
        controller.enqueue(encoder.encode(JSON.stringify(obj) + '\n'));
      }

      const mergeLock = { chain: Promise.resolve() as Promise<void> };
      let writesSinceFlush = 0;

      function maybeFlush(store: LyricsStore, force = false) {
        writesSinceFlush++;
        if (force || writesSinceFlush >= 8) {
          writeLyrics(store);
          writesSinceFlush = 0;
        }
      }

      try {
        let store = readLyrics() ?? createEmptyLyricsStore();
        store.syncedAt = new Date().toISOString();
        writeLyrics(store);

        send({ type: 'start', total, job: 'lyrics', scoped });
        send({ type: 'phase', phase: 'lyrics', concurrency: LYRICS_CONCURRENCY });

        let done = 0;

        await mapConcurrent(tracks, LYRICS_CONCURRENCY, async track => {
          const lyrics = await fetchLyricsFromApi(track.song, track.album);
          done++;

          await runExclusive(mergeLock, () => {
            const { ok, lineCount } = applyLyricsToStore(store, track, lyrics);
            if (ok) {
              send({ type: 'lyrics_ok', song: track.song, album: track.album, lines: lineCount });
            } else {
              send({ type: 'lyrics_fail', song: track.song, album: track.album });
            }
            send({
              type: 'progress',
              phase: 'lyrics',
              completed: done,
              total,
            });
            maybeFlush(store);
          });
        });

        store.syncedAt = new Date().toISOString();
        writeLyrics(store);
        send({
          type: 'done',
          job: 'lyrics',
          parsed: store.parsed,
          failed: store.failed,
          scoped,
        });
      } catch (e: unknown) {
        const message = e instanceof Error ? e.message : String(e);
        send({ type: 'error', message });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
