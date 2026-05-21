/** Human-readable line for scan/lyrics stream events (UI live log + server terminal). */
export function formatScanEvent(event: Record<string, unknown>): string | null {
  switch (event.type) {
    case 'start':
      if (event.job === 'lyrics') {
        return event.scoped
          ? `Syncing lyrics — ${event.total} selected song(s)`
          : `Syncing lyrics — ${event.total} songs`;
      }
      return event.scoped
        ? `Scanning mentions — ${event.total} selected song(s) with lyrics`
        : `Scanning mentions — ${event.total} songs with lyrics`;
    case 'phase':
      return event.phase === 'lyrics'
        ? `Fetching lyrics (${event.concurrency} at a time)`
        : `Scanning mentions (${event.concurrency} at a time, ${event.withLyrics} songs)`;
    case 'fetch':
      return `[${event.index}] Fetching "${event.song}" · ${event.album}`;
    case 'extract':
      return `[${event.index}] Scanning "${event.song}" · ${event.album}`;
    case 'lyrics_ok':
      return `  ✓ "${event.song}" — ${event.lines} lines`;
    case 'lyrics_fail':
      return `  ✗ "${event.song}" — no lyrics found`;
    case 'friends':
      return `  → "${event.song}": ${event.count} mention(s): ${(event.names as string[]).join(', ')}`;
    case 'no_friends':
      return `  — "${event.song}": no mentions`;
    case 'paused':
      return `Paused — ${event.completed} / ${event.total} songs processed`;
    case 'done':
      if (event.job === 'lyrics') {
        return `Lyrics synced — ${event.parsed} found · ${event.failed} missing`;
      }
      return `Scan complete — ${event.friendCount} friends · ${event.songsProcessed} songs`;
    case 'error':
      return `Error: ${event.message}`;
    case 'progress':
      return null;
    default:
      return JSON.stringify(event);
  }
}
