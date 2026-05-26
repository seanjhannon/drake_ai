import fs from 'fs';
import path from 'path';
import { mentionKey } from '@/lib/mention-key';
import { assertReviewsWritable, loadReviews, persistReviews } from '@/lib/reviews-storage';
import type { MentionReview, ReviewsFile, ReviewStatus } from '@/lib/reviews-types';

export type { MentionReview, ReviewsFile, ReviewStatus } from '@/lib/reviews-types';

const REVIEWS_PATH = path.join(process.cwd(), 'data/reviews.json');

const MAX_POSITIVE_EXAMPLES = 2;
const MAX_NEGATIVE_EXAMPLES = 3;
const MAX_REVIEW_CHARS = 900;

const VALID_STATUSES: ReviewStatus[] = ['correct', 'incomplete', 'false_positive'];

export { mentionKey };

function emptyReviews(): ReviewsFile {
  return { updatedAt: '', reviews: {} };
}

export function readReviews(): ReviewsFile {
  try {
    if (!fs.existsSync(REVIEWS_PATH)) return emptyReviews();
    const raw = fs.readFileSync(REVIEWS_PATH, 'utf-8');
    const data = JSON.parse(raw) as ReviewsFile;
    return {
      updatedAt: data.updatedAt ?? '',
      reviews: data.reviews ?? {},
    };
  } catch {
    return emptyReviews();
  }
}

export function writeReviews(data: ReviewsFile): void {
  fs.writeFileSync(REVIEWS_PATH, JSON.stringify(data, null, 2), 'utf-8');
}

export function upsertReview(
  input: Omit<MentionReview, 'reviewedAt'> & { reviewedAt?: string },
): MentionReview {
  const data = readReviews();
  const review: MentionReview = {
    ...input,
    reviewedAt: input.reviewedAt ?? new Date().toISOString(),
  };
  data.reviews[review.mentionKey] = review;
  data.updatedAt = review.reviewedAt;
  writeReviews(data);
  return review;
}

export async function upsertReviewAsync(
  input: Omit<MentionReview, 'reviewedAt'> & { reviewedAt?: string },
): Promise<MentionReview> {
  assertReviewsWritable();
  const data = await loadReviews();
  const review: MentionReview = {
    ...input,
    reviewedAt: input.reviewedAt ?? new Date().toISOString(),
  };
  data.reviews[review.mentionKey] = review;
  data.updatedAt = review.reviewedAt;
  await persistReviews(data);
  return review;
}

function relevanceTier(r: MentionReview, album: string, song: string): number {
  if (r.song === song) return 0;
  if (r.album === album) return 1;
  return 2;
}

function sortByRelevance(reviews: MentionReview[], album: string, song: string): MentionReview[] {
  return [...reviews].sort(
    (a, b) => relevanceTier(a, album, song) - relevanceTier(b, album, song),
  );
}

function formatPositiveLine(r: MentionReview): string {
  return `GOOD: "${r.friend}" on bar "${r.bar}" (${r.song}, ${r.album}) — confirmed mention.`;
}

function formatNegativeLine(r: MentionReview): string {
  if (r.status === 'false_positive') {
    return `Do NOT extract "${r.friend}" on bar "${r.bar}" (${r.song}) — false positive.`;
  }
  const friend = r.correctedFriend ?? r.friend;
  const bar = r.correctedBar ?? r.bar;
  let line = `Use friend "${friend}" and bar "${bar}" instead of "${r.friend}" / "${r.bar}" (${r.song}).`;
  if (r.notes) line += ` ${r.notes}`;
  return line;
}

function pickExamples(
  candidates: MentionReview[],
  album: string,
  song: string,
  maxCount: number,
  usedChars: number,
  diversifyFriend: boolean,
): { lines: string[]; chars: number } {
  const sorted = sortByRelevance(candidates, album, song);
  const lines: string[] = [];
  let chars = usedChars;
  const seenFriends = new Set<string>();

  for (const r of sorted) {
    if (lines.length >= maxCount) break;
    if (diversifyFriend && seenFriends.has(r.friend) && lines.length > 0) continue;

    const line = r.status === 'correct' ? formatPositiveLine(r) : formatNegativeLine(r);
    const bullet = `- ${line}`;
    if (chars + bullet.length + 1 > MAX_REVIEW_CHARS) break;

    lines.push(bullet);
    chars += bullet.length + 1;
    seenFriends.add(r.friend);
  }

  return { lines, chars };
}

export function formatReviewExamplesForPrompt(album: string, song: string): string {
  const { reviews } = readReviews();
  const all = Object.values(reviews);

  const positives = all.filter(r => r.status === 'correct');
  const negatives = all.filter(r => r.status === 'incomplete' || r.status === 'false_positive');

  const { lines: positiveLines, chars: afterPositive } = pickExamples(
    positives,
    album,
    song,
    MAX_POSITIVE_EXAMPLES,
    0,
    true,
  );
  const { lines: negativeLines } = pickExamples(
    negatives,
    album,
    song,
    MAX_NEGATIVE_EXAMPLES,
    afterPositive,
    false,
  );

  if (positiveLines.length === 0 && negativeLines.length === 0) return '';

  const parts: string[] = ['HUMAN REVIEW EXAMPLES (follow these):'];

  if (positiveLines.length > 0) {
    parts.push('', 'Good extractions to match:', ...positiveLines);
  }
  if (negativeLines.length > 0) {
    parts.push('', 'Avoid or fix these:', ...negativeLines);
  }

  return parts.join('\n');
}

export function isValidReviewStatus(status: unknown): status is ReviewStatus {
  return typeof status === 'string' && VALID_STATUSES.includes(status as ReviewStatus);
}
