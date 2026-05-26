export type ReviewStatus = 'correct' | 'incomplete' | 'false_positive';

export interface MentionReview {
  mentionKey: string;
  status: ReviewStatus;
  friend: string;
  bar: string;
  song: string;
  album: string;
  year: number;
  correctedFriend?: string;
  correctedBar?: string;
  notes?: string;
  reviewedAt: string;
}

export interface ReviewsFile {
  updatedAt: string;
  reviews: Record<string, MentionReview>;
}
