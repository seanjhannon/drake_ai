import { NextRequest } from 'next/server';
import { demoModeResponse, isDemoMode } from '@/lib/demo-mode';
import { mapConcurrent, runExclusive } from '@/lib/concurrent';
import { extractFriends } from '@/lib/extract';
import { mentionKey } from '@/lib/mention-key';
import { getTracksWithLyrics, readLyrics } from '@/lib/lyrics';
import {
  countSongsWithMentions,
  filterTracks,
  parseTrackSelection,
  removeMentionsForTracks,
  seedMentionKeys,
  selectionToTrackKeys,
  type TrackRef,
} from '@/lib/selection';
import { readResults, writeResults, type Mention, type Results } from '@/lib/results';
import { formatScanEvent } from '@/lib/scan-log';

export const maxDuration = 300;
export const dynamic = 'force-dynamic';

/** Parallel workers; LLM calls are serialized by rate limiter (~45 req/min). */
const EXTRACT_CONCURRENCY = 2;

async function parseSelection(request: NextRequest) {
  if (request.method === 'POST') {
    try {
      const body = await request.json();
      return parseTrackSelection(body);
    } catch {
      return null;
    }
  }
  return null;
}

export async function GET(request: NextRequest) {
  if (isDemoMode()) return demoModeResponse();
  return runExtract(request, null);
}

export async function POST(request: NextRequest) {
  if (isDemoMode()) return demoModeResponse();
  const selection = await parseSelection(request);
  return runExtract(request, selection);
}

async function runExtract(request: NextRequest, selection: ReturnType<typeof parseTrackSelection>) {
  const lyricsStore = readLyrics();
  if (!lyricsStore || lyricsStore.parsed === 0) {
    return new Response(
      JSON.stringify({
        type: 'error',
        message: 'No lyrics on disk. Run POST /api/lyrics first to sync Drake\'s discography.',
      }) + '\n',
      { status: 400, headers: { 'Content-Type': 'application/json' } },
    );
  }

  const scoped = selection !== null;
  const allWithLyrics = getTracksWithLyrics(lyricsStore);
  const withLyrics = filterTracks(allWithLyrics, selection);

  if (scoped && withLyrics.length === 0) {
    return new Response(
      JSON.stringify({
        type: 'error',
        message: 'No selected songs have lyrics on disk. Sync lyrics for those tracks first.',
      }) + '\n',
      { status: 400, headers: { 'Content-Type': 'application/json' } },
    );
  }

  const encoder = new TextEncoder();
  const refsToReplace: TrackRef[] = withLyrics.map(t => ({ song: t.song, album: t.album }));

  const stream = new ReadableStream({
    async start(controller) {
      function send(obj: object) {
        const line = formatScanEvent(obj as Record<string, unknown>);
        if (line) console.log(`[scan] ${line}`);
        controller.enqueue(encoder.encode(JSON.stringify(obj) + '\n'));
      }

      const mergeLock = { chain: Promise.resolve() as Promise<void> };
      let writesSinceFlush = 0;

      function maybeFlush(results: Results, force = false) {
        writesSinceFlush++;
        if (force || writesSinceFlush >= 8) {
          writeResults(results);
          writesSinceFlush = 0;
        }
      }

      try {
        const existing = readResults();
        const results: Results = scoped && existing
          ? { ...existing, scannedAt: new Date().toISOString() }
          : {
              scannedAt: new Date().toISOString(),
              songsProcessed: 0,
              mentions: {},
            };

        if (scoped) {
          removeMentionsForTracks(results, refsToReplace);
        }

        const existingKeys = seedMentionKeys(results);

        send({ type: 'start', total: withLyrics.length, job: 'extract', scoped });
        send({
          type: 'phase',
          phase: 'extract',
          concurrency: EXTRACT_CONCURRENCY,
          withLyrics: withLyrics.length,
        });

        let extractDone = 0;

        await mapConcurrent(withLyrics, EXTRACT_CONCURRENCY, async track => {
          if (request.signal.aborted) return;

          send({ type: 'extract', song: track.song, album: track.album, index: track.index });

          let friends: Mention[] = [];
          try {
            friends = await extractFriends(track.song, track.album, track.year, track.lyrics);
          } catch (e: unknown) {
            const message = e instanceof Error ? e.message : String(e);
            send({ type: 'error', message: `AI error for ${track.song}: ${message}` });
          }

          extractDone++;
          send({
            type: 'progress',
            phase: 'extract',
            completed: extractDone,
            total: withLyrics.length,
          });

          await runExclusive(mergeLock, () => {
            const newFriends = friends.filter(f => {
              const key = mentionKey(f);
              if (existingKeys.has(key)) return false;
              existingKeys.add(key);
              return true;
            });

            if (newFriends.length > 0) {
              for (const mention of newFriends) {
                if (!results.mentions[mention.friend]) {
                  results.mentions[mention.friend] = [];
                }
                results.mentions[mention.friend].push(mention);
              }
              const names = [...new Set(newFriends.map(f => f.friend))];
              send({
                type: 'friends',
                song: track.song,
                album: track.album,
                names,
                count: newFriends.length,
              });
            } else {
              send({ type: 'no_friends', song: track.song, album: track.album });
            }
            maybeFlush(results);
          });
        }, { signal: request.signal });

        results.songsProcessed = countSongsWithMentions(results.mentions);
        writeResults(results);

        if (request.signal.aborted) {
          send({
            type: 'paused',
            completed: extractDone,
            total: withLyrics.length,
          });
          return;
        }

        const friendCount = Object.keys(results.mentions).length;
        send({
          type: 'done',
          job: 'extract',
          friendCount,
          songsProcessed: results.songsProcessed,
          scoped,
          selected: scoped ? selectionToTrackKeys(selection!).size : undefined,
        });
      } catch (e: unknown) {
        const message = e instanceof Error ? e.message : String(e);
        controller.enqueue(encoder.encode(JSON.stringify({ type: 'error', message }) + '\n'));
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
