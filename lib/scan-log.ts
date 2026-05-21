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
        ? `Extracting figures — ${event.total} selected song(s) with lyrics`
        : `Extracting figures — ${event.total} songs with lyrics`;
    case 'phase':
      return event.phase === 'lyrics'
        ? `Fetching lyrics (${event.concurrency} at a time)`
        : `Extracting figures (${event.concurrency} at a time, ${event.withLyrics} songs)`;
    case 'fetch':
      return `[${event.index}] Fetching "${event.song}" · ${event.album}`;
    case 'extract':
      return `[${event.index}] Extracting "${event.song}" · ${event.album}`;
    case 'lyrics_ok':
      return `  ✓ "${event.song}" — ${event.lines} lines`;
    case 'lyrics_fail':
      return `  ✗ "${event.song}" — no lyrics found`;
    case 'figures':
      return `  → "${event.song}": ${event.count} mention(s): ${(event.names as string[]).join(', ')}`;
    case 'no_figures':
      return `  — "${event.song}": no figures`;
    case 'paused':
      return `Paused — ${event.completed} / ${event.total} songs processed`;
    case 'done':
      if (event.job === 'lyrics') {
        return `Lyrics synced — ${event.parsed} found · ${event.failed} missing`;
      }
      return `Extraction done — ${event.figureCount} figures · ${event.songsProcessed} songs`;
    case 'error':
      return `Error: ${event.message}`;
    case 'progress':
      return null;
    default:
      return JSON.stringify(event);
  }
}
