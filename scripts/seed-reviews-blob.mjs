#!/usr/bin/env node
/**
 * Upload committed data/reviews.json to Vercel Blob (one-time or after merging local reviews).
 * Requires BLOB_READ_WRITE_TOKEN in the environment.
 *
 *   BLOB_READ_WRITE_TOKEN=... node scripts/seed-reviews-blob.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { put } from '@vercel/blob';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const BLOB_PATHNAME = 'drake-reviews.json';

if (!process.env.BLOB_READ_WRITE_TOKEN) {
  console.error('Missing BLOB_READ_WRITE_TOKEN');
  process.exit(1);
}

const reviewsPath = path.join(root, 'data/reviews.json');
const raw = fs.readFileSync(reviewsPath, 'utf8');
const data = JSON.parse(raw);
const count = Object.keys(data.reviews ?? {}).length;

const blob = await put(BLOB_PATHNAME, raw, {
  access: 'public',
  addRandomSuffix: false,
  allowOverwrite: true,
  contentType: 'application/json',
});

console.log(`Uploaded ${count} reviews → ${blob.url}`);
