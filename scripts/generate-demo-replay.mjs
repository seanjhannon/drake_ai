#!/usr/bin/env node
/**
 * Build demo replay logs from committed lyrics + results.
 *
 *   node scripts/generate-demo-replay.mjs
 *
 * Outputs:
 *   public/data/demo-lyrics.jsonl — full discography lyrics sync (179 songs)
 *   public/data/demo-scan.jsonl   — mention scan for every song with lyrics (175)
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const outDir = path.join(root, 'public/data');

const lyrics = JSON.parse(fs.readFileSync(path.join(root, 'data/lyrics.json'), 'utf8'));
const results = JSON.parse(fs.readFileSync(path.join(root, 'results.json'), 'utf8'));

const catalogTracks = lyrics.tracks;
const scanTracks = catalogTracks.filter(t => t.lyrics?.length);

const mentionsByTrack = new Map();
for (const list of Object.values(results.mentions)) {
  for (const m of list) {
    const key = `${m.song}|||${m.album}`;
    if (!mentionsByTrack.has(key)) mentionsByTrack.set(key, []);
    mentionsByTrack.get(key).push(m);
  }
}

function writeJsonl(filename, lines) {
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, filename);
  fs.writeFileSync(outPath, lines.join('\n') + '\n');
  console.log(`Wrote ${lines.length} events → ${outPath}`);
}

// ── Lyrics sync replay ───────────────────────────────────────────────────────

const lyricsLines = [];
const sendLyrics = obj => lyricsLines.push(JSON.stringify(obj));

sendLyrics({ type: 'start', total: catalogTracks.length, job: 'lyrics', scoped: false });
sendLyrics({ type: 'phase', phase: 'lyrics', concurrency: 15 });

let lyricsDone = 0;
for (const track of catalogTracks) {
  const hasLyrics = !!(track.lyrics && track.lyrics.length > 0);
  if (hasLyrics) {
    sendLyrics({
      type: 'lyrics_ok',
      song: track.song,
      album: track.album,
      lines: track.lineCount ?? track.lyrics.split('\n').filter(Boolean).length,
    });
  } else {
    sendLyrics({ type: 'lyrics_fail', song: track.song, album: track.album });
  }
  lyricsDone++;
  sendLyrics({
    type: 'progress',
    phase: 'lyrics',
    completed: lyricsDone,
    total: catalogTracks.length,
  });
}

sendLyrics({
  type: 'done',
  job: 'lyrics',
  parsed: lyrics.parsed,
  failed: lyrics.failed,
  scoped: false,
});

writeJsonl('demo-lyrics.jsonl', lyricsLines);

// ── Mention scan replay ────────────────────────────────────────────────────────

const scanLines = [];
const sendScan = obj => scanLines.push(JSON.stringify(obj));

sendScan({ type: 'start', total: scanTracks.length, job: 'extract', scoped: false });
sendScan({
  type: 'phase',
  phase: 'extract',
  concurrency: 2,
  withLyrics: scanTracks.length,
});

let scanDone = 0;
for (const track of scanTracks) {
  sendScan({
    type: 'extract',
    song: track.song,
    album: track.album,
    index: track.index,
  });

  const key = `${track.song}|||${track.album}`;
  const found = mentionsByTrack.get(key) ?? [];
  if (found.length > 0) {
    const names = [...new Set(found.map(m => m.friend))];
    sendScan({
      type: 'friends',
      song: track.song,
      album: track.album,
      names,
      count: found.length,
    });
  } else {
    sendScan({ type: 'no_friends', song: track.song, album: track.album });
  }

  scanDone++;
  sendScan({
    type: 'progress',
    phase: 'extract',
    completed: scanDone,
    total: scanTracks.length,
  });
}

const friendCount = Object.keys(results.mentions).length;
const songsWithMentions = new Set();
for (const list of Object.values(results.mentions)) {
  for (const m of list) songsWithMentions.add(`${m.song}|||${m.album}`);
}

sendScan({
  type: 'done',
  job: 'extract',
  friendCount,
  songsProcessed: songsWithMentions.size,
  scoped: false,
});

writeJsonl('demo-scan.jsonl', scanLines);

console.log(
  `Catalog: ${catalogTracks.length} songs · scan: ${scanTracks.length} with lyrics · ${friendCount} friends in results`,
);
