/**
 * Full mention extraction into results.json (same logic as GET /api/scan).
 * Loads API keys from .env.local. Re-applies manual "correct" reviews after a full scan.
 *
 *   npx tsx scripts/scan-mentions.ts          # full rescan of all tracks with lyrics
 *   npx tsx scripts/scan-mentions.ts --missing  # only songs with no mentions yet
 */
import fs from 'fs';
import path from 'path';
import { mapConcurrent, runExclusive } from '../lib/concurrent';
import { extractFriends } from '../lib/extract';
import { getTracksWithLyrics, readLyrics } from '../lib/lyrics';
import { mentionKey } from '../lib/mention-key';
import { countSongsWithMentions, removeMentionsForTracks, seedMentionKeys } from '../lib/selection';
import {
  addManualMention,
  readResults,
  writeResults,
  type Mention,
  type Results,
} from '../lib/results';
import { readReviews } from '../lib/reviews';
import { trackKey } from '../lib/tracks';

const EXTRACT_CONCURRENCY = 2;

function loadEnvLocal(): void {
  const envPath = path.join(process.cwd(), '.env.local');
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = val;
  }
}

loadEnvLocal();

function mergeCorrectReviews(results: Results): number {
  const { reviews } = readReviews();
  let added = 0;
  for (const review of Object.values(reviews)) {
    if (review.status !== 'correct') continue;
    const mention: Mention = {
      friend: review.correctedFriend ?? review.friend,
      bar: review.correctedBar ?? review.bar,
      song: review.song,
      album: review.album,
      year: review.year,
    };
    const { added: wasNew } = addManualMention(mention);
    if (wasNew) added++;
  }
  return added;
}

async function main() {
  const onlyMissing = process.argv.includes('--missing');
  const lyricsStore = readLyrics();
  if (!lyricsStore || lyricsStore.parsed === 0) {
    console.error('No lyrics on disk. Run: npm run sync:lyrics');
    process.exit(1);
  }

  let withLyrics = getTracksWithLyrics(lyricsStore);

  if (onlyMissing) {
    const existing = readResults();
    const songsWithMentions = new Set<string>();
    if (existing) {
      for (const list of Object.values(existing.mentions)) {
        for (const m of list) {
          songsWithMentions.add(trackKey(m.song, m.album));
        }
      }
    }
    withLyrics = withLyrics.filter(t => !songsWithMentions.has(trackKey(t.song, t.album)));
    console.log(`Scanning ${withLyrics.length} tracks without mentions…`);
  } else {
    console.log(`Full rescan: ${withLyrics.length} tracks with lyrics…`);
  }

  if (withLyrics.length === 0) {
    console.log('Nothing to scan.');
    return;
  }

  const existing = onlyMissing ? readResults() : null;
  const results: Results = existing
    ? { ...existing, scannedAt: new Date().toISOString() }
    : {
        scannedAt: new Date().toISOString(),
        songsProcessed: 0,
        mentions: {},
      };

  if (onlyMissing && existing) {
    // keep existing mentions
  } else if (!onlyMissing) {
    results.mentions = {};
  }

  const refsToReplace = withLyrics.map(t => ({ song: t.song, album: t.album }));
  if (onlyMissing && existing) {
    // no removal
  } else {
    removeMentionsForTracks(results, refsToReplace);
  }

  const existingKeys = seedMentionKeys(results);
  const mergeLock = { chain: Promise.resolve() as Promise<void> };
  let writesSinceFlush = 0;
  let done = 0;
  let errors = 0;

  function maybeFlush(force = false) {
    writesSinceFlush++;
    if (force || writesSinceFlush >= 8) {
      writeResults(results);
      writesSinceFlush = 0;
    }
  }

  await mapConcurrent(withLyrics, EXTRACT_CONCURRENCY, async track => {
    let friends: Mention[] = [];
    try {
      friends = await extractFriends(track.song, track.album, track.year, track.lyrics);
    } catch (e: unknown) {
      errors++;
      const message = e instanceof Error ? e.message : String(e);
      console.error(`[error] ${track.album} — ${track.song}: ${message}`);
    }

    done++;
    if (done % 10 === 0 || done === withLyrics.length) {
      console.log(`[progress] ${done}/${withLyrics.length}`);
    }

    await runExclusive(mergeLock, () => {
      const newFriends = friends.filter(f => {
        const key = mentionKey(f);
        if (existingKeys.has(key)) return false;
        existingKeys.add(key);
        return true;
      });

      for (const mention of newFriends) {
        if (!results.mentions[mention.friend]) {
          results.mentions[mention.friend] = [];
        }
        results.mentions[mention.friend].push(mention);
      }
      maybeFlush();
    });
  });

  results.songsProcessed = countSongsWithMentions(results.mentions);
  writeResults(results);

  if (!onlyMissing) {
    const merged = mergeCorrectReviews(readResults()!);
    if (merged > 0) {
      console.log(`Re-applied ${merged} manual correct review(s) from data/reviews.json`);
    }
  }

  const final = readResults()!;
  const friendCount = Object.keys(final.mentions).length;
  const mentionCount = Object.values(final.mentions).reduce((s, l) => s + l.length, 0);

  console.log(
    `\nDone: ${final.songsProcessed} songs with mentions · ${friendCount} friends · ${mentionCount} total mentions`,
  );
  if (errors > 0) console.log(`(${errors} track(s) had extraction errors — re-run with --missing)`);
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
