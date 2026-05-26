import { list, put } from '@vercel/blob';
import fs from 'fs';
import path from 'path';
import { isDemoMode } from '@/lib/demo-mode';
import type { ReviewsFile } from '@/lib/reviews-types';

const REVIEWS_PATH = path.join(process.cwd(), 'data/reviews.json');
const BLOB_PATHNAME = 'drake-reviews.json';

export class ReviewsStorageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ReviewsStorageError';
  }
}

export function hasRemoteReviewStore(): boolean {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN);
}

function normalizeReviews(data: ReviewsFile): ReviewsFile {
  return {
    updatedAt: data.updatedAt ?? '',
    reviews: data.reviews ?? {},
  };
}

function readReviewsFromDisk(): ReviewsFile {
  try {
    if (!fs.existsSync(REVIEWS_PATH)) {
      return { updatedAt: '', reviews: {} };
    }
    const raw = fs.readFileSync(REVIEWS_PATH, 'utf-8');
    return normalizeReviews(JSON.parse(raw) as ReviewsFile);
  } catch {
    return { updatedAt: '', reviews: {} };
  }
}

function writeReviewsToDisk(data: ReviewsFile): void {
  fs.writeFileSync(REVIEWS_PATH, JSON.stringify(data, null, 2), 'utf-8');
}

async function readReviewsFromBlob(): Promise<ReviewsFile | null> {
  const { blobs } = await list({ prefix: BLOB_PATHNAME, limit: 10 });
  const blob = blobs.find(b => b.pathname === BLOB_PATHNAME) ?? blobs[0];
  if (!blob) return null;

  const res = await fetch(blob.url, { cache: 'no-store' });
  if (!res.ok) return null;
  return normalizeReviews(JSON.parse(await res.text()) as ReviewsFile);
}

async function writeReviewsToBlob(data: ReviewsFile): Promise<void> {
  await put(BLOB_PATHNAME, JSON.stringify(data, null, 2), {
    access: 'public',
    addRandomSuffix: false,
    allowOverwrite: true,
    cacheControlMaxAge: 60,
    contentType: 'application/json',
  });
}

/** Reviews can be saved locally, or on Vercel demo when Blob is configured. */
export function assertReviewsWritable(): void {
  if (isDemoMode() && process.env.VERCEL && !hasRemoteReviewStore()) {
    throw new ReviewsStorageError(
      'Community reviews need Vercel Blob. Add a Blob store to the project (BLOB_READ_WRITE_TOKEN).',
    );
  }
}

export async function loadReviews(): Promise<ReviewsFile> {
  if (hasRemoteReviewStore()) {
    const remote = await readReviewsFromBlob();
    if (remote) return remote;
  }
  return readReviewsFromDisk();
}

export async function persistReviews(data: ReviewsFile): Promise<void> {
  assertReviewsWritable();
  if (hasRemoteReviewStore()) {
    await writeReviewsToBlob(data);
    return;
  }
  writeReviewsToDisk(data);
}
