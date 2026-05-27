/**
 * Sync missing lyrics from lrclib into data/lyrics.json (same logic as POST /api/lyrics).
 *
 *   npx tsx scripts/sync-lyrics.ts
 *   npx tsx scripts/sync-lyrics.ts --all   # re-fetch every track
 */
import {
  applyLyricsToStore,
  createEmptyLyricsStore,
  ensureStoreTracks,
  fetchLyricsFromApi,
  readLyrics,
  writeLyrics,
} from '../lib/lyrics';
import { buildTrackList, trackKey } from '../lib/tracks';

const CONCURRENCY = 15;

async function mapConcurrent<T>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<void>,
): Promise<void> {
  let i = 0;
  async function worker() {
    while (i < items.length) {
      const idx = i++;
      await fn(items[idx]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()));
}

async function main() {
  const refetchAll = process.argv.includes('--all');

  let store = readLyrics() ?? createEmptyLyricsStore();
  ensureStoreTracks(store);

  const catalog = buildTrackList();
  const toSync = catalog.filter(t => {
    if (refetchAll) return true;
    const row = store.tracks.find(st => trackKey(st.song, st.album) === trackKey(t.song, t.album));
    return !row?.lyrics?.length;
  });

  console.log(
    `Catalog: ${catalog.length} tracks · syncing ${toSync.length}${refetchAll ? ' (full refresh)' : ' (missing only)'}`,
  );

  let done = 0;
  let ok = 0;
  let fail = 0;

  await mapConcurrent(toSync, CONCURRENCY, async track => {
    const lyrics = await fetchLyricsFromApi(track.song, track.album);
    const { ok: hasLyrics } = applyLyricsToStore(store, track, lyrics);
    done++;
    if (hasLyrics) {
      ok++;
      console.log(`[ok] ${track.album} — ${track.song}`);
    } else {
      fail++;
      console.log(`[fail] ${track.album} — ${track.song}`);
    }
    if (done % 8 === 0 || done === toSync.length) {
      writeLyrics(store);
    }
  });

  store.syncedAt = new Date().toISOString();
  writeLyrics(store);

  console.log(`\nDone: ${store.parsed}/${store.totalSongs} with lyrics (${store.failed} failed)`);
  if (store.failedSongs.length > 0) {
    console.log('Failed:');
    for (const f of store.failedSongs) {
      console.log(`  - ${f.song} (${f.album})`);
    }
  }
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
