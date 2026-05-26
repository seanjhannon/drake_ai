import { NextRequest, NextResponse } from 'next/server';
import { mentionKey } from '@/lib/mention-key';
import {
  hasRemoteReviewStore,
  loadReviews,
  ReviewsStorageError,
} from '@/lib/reviews-storage';
import {
  isValidReviewStatus,
  upsertReviewAsync,
  type MentionReview,
  type ReviewStatus,
} from '@/lib/reviews';

export async function GET() {
  const data = await loadReviews();
  const exists = Object.keys(data.reviews).length > 0 || data.updatedAt !== '';
  return NextResponse.json({
    exists,
    data,
    storage: hasRemoteReviewStore() ? 'blob' : 'disk',
  });
}

export async function POST(request: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const status = body.status;
  if (!isValidReviewStatus(status)) {
    return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
  }

  const friend = typeof body.friend === 'string' ? body.friend : '';
  const bar = typeof body.bar === 'string' ? body.bar : '';
  const song = typeof body.song === 'string' ? body.song : '';
  const album = typeof body.album === 'string' ? body.album : '';
  const year = typeof body.year === 'number' ? body.year : Number(body.year) || 0;

  if (!friend || !bar || !song || !album) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }

  const key =
    typeof body.mentionKey === 'string' && body.mentionKey
      ? body.mentionKey
      : mentionKey({ friend, bar, song });

  const review: Omit<MentionReview, 'reviewedAt'> = {
    mentionKey: key,
    status: status as ReviewStatus,
    friend,
    bar,
    song,
    album,
    year,
  };

  if (typeof body.correctedFriend === 'string' && body.correctedFriend) {
    review.correctedFriend = body.correctedFriend;
  }
  if (typeof body.correctedBar === 'string' && body.correctedBar) {
    review.correctedBar = body.correctedBar;
  }
  if (typeof body.notes === 'string' && body.notes) {
    review.notes = body.notes;
  }

  try {
    const saved = await upsertReviewAsync(review);
    return NextResponse.json({ ok: true, review: saved });
  } catch (e: unknown) {
    if (e instanceof ReviewsStorageError) {
      return NextResponse.json({ error: e.message }, { status: 503 });
    }
    const message = e instanceof Error ? e.message : 'Failed to save review';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
