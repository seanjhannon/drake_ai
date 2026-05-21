import type { Mention } from '@/lib/results';

export function mentionKey(m: Pick<Mention, 'friend' | 'bar' | 'song'>): string {
  return `${m.friend}|||${m.bar}|||${m.song}`;
}
