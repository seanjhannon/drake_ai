#!/usr/bin/env node
/**
 * Build public/data/demo-scan.jsonl from committed lyrics + results.
 * Re-run after changing the demo album scope or re-scanning locally.
 *
 *   node scripts/generate-demo-scan.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

const DEMO_ALBUMS = new Set(['Take Care', 'Iceman']);
const lyrics = JSON.parse(fs.readFileSync(path.join(root, 'data/lyrics.json'), 'utf8'));
const results = JSON.parse(fs.readFileSync(path.join(root, 'results.json'), 'utf8'));

const tracks = lyrics.tracks
  .filter(t => DEMO_ALBUMS.has(t.album) && t.lyrics?.length)
  .map((t, i) => ({ ...t, index: i + 1 }));

const mentionsByTrack = new Map();
for (const list of Object.values(results.mentions)) {
  for (const m of list) {
    const key = `${m.song}|||${m.album}`;
    if (!mentionsByTrack.has(key)) mentionsByTrack.set(key, []);
    mentionsByTrack.get(key).push(m);
  }
}

const lines = [];
const send = obj => lines.push(JSON.stringify(obj));

send({ type: 'start', total: tracks.length, job: 'extract', scoped: false });
send({
  type: 'phase',
  phase: 'extract',
  concurrency: 2,
  withLyrics: tracks.length,
});

let completed = 0;
for (const track of tracks) {
  send({
    type: 'extract',
    song: track.song,
    album: track.album,
    index: track.index,
  });

  const key = `${track.song}|||${track.album}`;
  const found = mentionsByTrack.get(key) ?? [];
  if (found.length > 0) {
    const names = [...new Set(found.map(m => m.friend))];
    send({
      type: 'friends',
      song: track.song,
      album: track.album,
      names,
      count: found.length,
    });
  } else {
    send({ type: 'no_friends', song: track.song, album: track.album });
  }

  completed++;
  send({
    type: 'progress',
    phase: 'extract',
    completed,
    total: tracks.length,
  });
}

const friendCount = Object.keys(results.mentions).length;
send({
  type: 'done',
  job: 'extract',
  friendCount,
  songsProcessed: results.songsProcessed,
  scoped: false,
});

const outDir = path.join(root, 'public/data');
fs.mkdirSync(outDir, { recursive: true });
const outPath = path.join(outDir, 'demo-scan.jsonl');
fs.writeFileSync(outPath, lines.join('\n') + '\n');
console.log(`Wrote ${lines.length} events (${tracks.length} tracks) → ${outPath}`);
