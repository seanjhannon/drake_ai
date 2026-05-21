'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { DRAKE_DISCOGRAPHY, ALBUM_COLORS, TOTAL_SONGS } from '@/lib/discography';
import { formatScanEvent } from '@/lib/scan-log';
import { trackKey } from '@/lib/tracks';

// ── Types ──────────────────────────────────────────────────────────────────────

interface Mention {
  figure: string;
  bar: string;
  song: string;
  album: string;
  year: number;
}

interface Results {
  scannedAt: string;
  songsProcessed: number;
  mentions: Record<string, Mention[]>;
}

interface LyricsStatus {
  syncedAt: string;
  totalSongs: number;
  parsed: number;
  failed: number;
  failedSongs: Array<{ song: string; album: string }>;
  trackLyrics?: Record<string, boolean>;
}

interface LogEntry {
  type: string;
  text: string;
  color: string;
}

type SortOrder = 'count' | 'alpha' | 'earliest';
type Tab = 'overview' | 'timeline' | 'detail' | 'retrack';

interface TrackSelectionBody {
  albums?: string[];
  tracks: Array<{ song: string; album: string }>;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function logColor(type: string): string {
  if (type === 'lyrics_ok') return '#C9A84C';
  if (type === 'lyrics_fail') return '#cc4444';
  if (type === 'figures') return '#E8D5A3';
  if (type === 'done') return '#C9A84C';
  if (type === 'paused') return '#C9A84C';
  if (type === 'error') return '#cc4444';
  return '#5A5A5A';
}

function sortFigures(mentions: Record<string, Mention[]>, order: SortOrder): [string, Mention[]][] {
  const entries = Object.entries(mentions);
  if (order === 'count') return entries.sort((a, b) => b[1].length - a[1].length);
  if (order === 'alpha') return entries.sort((a, b) => a[0].localeCompare(b[0]));
  if (order === 'earliest') {
    return entries.sort((a, b) => {
      const aMin = Math.min(...a[1].map(m => m.year));
      const bMin = Math.min(...b[1].map(m => m.year));
      return aMin - bMin;
    });
  }
  return entries;
}

function selectionFromKeys(keys: Iterable<string>): TrackSelectionBody {
  return {
    tracks: [...keys].map(key => {
      const sep = key.indexOf('|||');
      return { song: key.slice(0, sep), album: key.slice(sep + 3) };
    }),
  };
}

function albumTrackKeys(album: string, songs: string[]): string[] {
  return songs.map(song => trackKey(song, album));
}

function allTracksWithLyrics(lyrics: LyricsStatus): Array<{ song: string; album: string }> {
  const out: Array<{ song: string; album: string }> = [];
  for (const { album, songs } of DRAKE_DISCOGRAPHY) {
    for (const song of songs) {
      const key = trackKey(song, album);
      if (lyrics.trackLyrics?.[key]) out.push({ song, album });
    }
  }
  return out;
}

interface ExtractSession {
  scopeTracks: Array<{ song: string; album: string }> | null;
  processedKeys: Set<string>;
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function StatCard({ label, value }: { label: string; value: number | string }) {
  return (
    <div style={{
      background: '#141414',
      border: '1px solid #2A2A2A',
      padding: '20px 24px',
      borderRadius: 4,
    }}>
      <div style={{ color: '#5A5A5A', fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 8 }}>{label}</div>
      <div style={{ color: '#C9A84C', fontSize: 32, fontWeight: 'bold', fontFamily: 'Georgia, serif' }}>{value}</div>
    </div>
  );
}

function BarChart({ mentions, onSelect }: { mentions: Record<string, Mention[]>; onSelect: (f: string) => void }) {
  const sorted = Object.entries(mentions).sort((a, b) => b[1].length - a[1].length).slice(0, 15);
  if (sorted.length === 0) return null;
  const max = sorted[0][1].length;

  return (
    <div style={{ marginTop: 24 }}>
      <div style={{ color: '#5A5A5A', fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 16 }}>Top Figures by Mentions</div>
      {sorted.map(([figure, ms]) => {
        const albums = [...new Set(ms.map(m => m.album))];
        const pct = (ms.length / max) * 100;
        return (
          <div
            key={figure}
            onClick={() => onSelect(figure)}
            style={{ marginBottom: 10, cursor: 'pointer' }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
              <span style={{ color: '#E8D5A3', fontSize: 13 }}>{figure}</span>
              <span style={{ color: '#C9A84C', fontSize: 13 }}>{ms.length}</span>
            </div>
            <div style={{ background: '#1A1A1A', height: 6, borderRadius: 3, overflow: 'hidden' }}>
              <div style={{
                width: `${pct}%`,
                height: '100%',
                background: 'linear-gradient(90deg, #C9A84C, #8B6830)',
                borderRadius: 3,
                transition: 'width 0.6s ease',
              }} />
            </div>
            <div style={{ marginTop: 4, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {albums.map(a => (
                <span key={a} style={{
                  fontSize: 10,
                  color: '#5A5A5A',
                  background: (ALBUM_COLORS[a] || '#5A5A5A') + '22',
                  borderLeft: `2px solid ${ALBUM_COLORS[a] || '#5A5A5A'}`,
                  padding: '1px 6px',
                  borderRadius: '0 2px 2px 0',
                }}>{a}</span>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────────

type JobKind = 'lyrics' | 'extract' | null;

export default function Home() {
  const [results, setResults] = useState<Results | null>(null);
  const [lyrics, setLyrics] = useState<LyricsStatus | null>(null);
  const [job, setJob] = useState<JobKind>(null);
  const [log, setLog] = useState<LogEntry[]>([]);
  const [progress, setProgress] = useState(0);
  const [sortOrder, setSortOrder] = useState<SortOrder>('count');
  const [tab, setTab] = useState<Tab>('overview');
  const [selectedFigure, setSelectedFigure] = useState<string | null>(null);
  const [selectedTracks, setSelectedTracks] = useState<Set<string>>(new Set());
  const [expandedAlbums, setExpandedAlbums] = useState<Set<string>>(new Set());
  const [apiStatus, setApiStatus] = useState<'ready' | 'busy' | 'error'>('ready');
  const [extractPaused, setExtractPaused] = useState(false);
  const logRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const pauseRequestedRef = useRef(false);
  const extractSessionRef = useRef<ExtractSession | null>(null);
  const inFlightExtractRef = useRef<{ song: string; album: string } | null>(null);

  const loadLyrics = useCallback(() => {
    return fetch('/api/lyrics')
      .then(r => r.json())
      .then(data => {
        if (data.exists && data.data) setLyrics(data.data);
        else setLyrics(null);
      })
      .catch(() => {});
  }, []);

  const loadResults = useCallback(() => {
    return fetch('/api/results')
      .then(r => r.json())
      .then(data => {
        if (data.exists && data.data) setResults(data.data);
        else setResults(null);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    loadLyrics();
    loadResults();
  }, [loadLyrics, loadResults]);

  // Auto-scroll log
  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [log]);

  const markExtractProcessed = useCallback((song: string, album: string) => {
    const session = extractSessionRef.current;
    if (!session) return;
    session.processedKeys.add(trackKey(song, album));
  }, []);

  const runStream = useCallback(
    async (
      url: string,
      method: 'GET' | 'POST',
      kind: JobKind,
      onDone?: () => Promise<void>,
      body?: TrackSelectionBody,
      opts?: { resume?: boolean },
    ) => {
      if (job) return;

      const isResume = opts?.resume === true;
      pauseRequestedRef.current = false;

      if (kind === 'extract') {
        if (!isResume) {
          extractSessionRef.current = {
            scopeTracks: body?.tracks ?? null,
            processedKeys: new Set(),
          };
        }
        setExtractPaused(false);
      }

      setJob(kind);
      setApiStatus('busy');
      if (!isResume) {
        setLog([]);
        setProgress(0);
      }
      if (kind === 'extract' && !body && !isResume) setResults(null);

      const abort = new AbortController();
      abortRef.current = abort;

      try {
        const response = await fetch(url, {
          method,
          signal: abort.signal,
          ...(body
            ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
            : {}),
        });
        if (!response.ok || !response.body) {
          const errBody = await response.text();
          throw new Error(errBody || 'Request failed');
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (!line.trim()) continue;
            try {
              const event = JSON.parse(line);
              const text = formatScanEvent(event);
              if (text) {
                const color = logColor(event.type);
                setLog(prev => [...prev, { type: event.type, text, color }]);
              }

              if (kind === 'extract') {
                if (event.type === 'extract') {
                  inFlightExtractRef.current = {
                    song: event.song as string,
                    album: event.album as string,
                  };
                }
                if (event.type === 'figures' || event.type === 'no_figures') {
                  const inflight = inFlightExtractRef.current;
                  if (inflight && inflight.song === event.song) {
                    markExtractProcessed(inflight.song, inflight.album);
                  }
                }
                if (event.type === 'error' && typeof event.message === 'string') {
                  const m = (event.message as string).match(/^AI error for (.+?):/);
                  if (m) {
                    const song = m[1];
                    const track = body?.tracks.find(t => t.song === song)
                      ?? extractSessionRef.current?.scopeTracks?.find(t => t.song === song)
                      ?? allTracksWithLyrics(lyrics!).find(t => t.song === song);
                    if (track) markExtractProcessed(track.song, track.album);
                  }
                }
              }

              if (event.type === 'progress') {
                const total = event.total as number;
                setProgress(Math.round(((event.completed as number) / total) * 100));
              }
              if (event.type === 'paused') {
                setExtractPaused(true);
                if (onDone) await onDone();
                setApiStatus('ready');
              }
              if (event.type === 'done') {
                setProgress(100);
                setExtractPaused(false);
                extractSessionRef.current = null;
                if (onDone) await onDone();
                setApiStatus('ready');
              }
              if (event.type === 'error') {
                setApiStatus('error');
              }
            } catch {}
          }
        }
      } catch (e: unknown) {
        const err = e as Error;
        if (err.name === 'AbortError' && pauseRequestedRef.current) {
          setExtractPaused(true);
          if (onDone) await onDone();
          setLog(prev => [
            ...prev,
            {
              type: 'paused',
              text: 'Paused — click Extract Figures to resume',
              color: '#C9A84C',
            },
          ]);
          setApiStatus('ready');
        } else if (err.name !== 'AbortError') {
          setLog(prev => [
            ...prev,
            { type: 'error', text: `Connection error: ${err.message}`, color: '#cc4444' },
          ]);
          setApiStatus('error');
        }
      } finally {
        setJob(null);
        pauseRequestedRef.current = false;
        setApiStatus(prev => (prev === 'busy' ? 'ready' : prev));
      }
    },
    [job, lyrics, markExtractProcessed],
  );

  const pauseExtract = useCallback(() => {
    if (job !== 'extract') return;
    pauseRequestedRef.current = true;
    abortRef.current?.abort();
  }, [job]);

  const resumeExtract = useCallback(() => {
    const session = extractSessionRef.current;
    if (!session || !lyrics) return;

    const scope = session.scopeTracks ?? allTracksWithLyrics(lyrics);
    const remaining = scope.filter(
      t => !session.processedKeys.has(trackKey(t.song, t.album)),
    );
    if (remaining.length === 0) {
      setExtractPaused(false);
      extractSessionRef.current = null;
      return;
    }

    runStream(
      '/api/scan',
      'POST',
      'extract',
      loadResults,
      { tracks: remaining },
      { resume: true },
    );
  }, [runStream, loadResults, lyrics]);

  const syncLyrics = useCallback(
    () => runStream('/api/lyrics', 'POST', 'lyrics', loadLyrics),
    [runStream, loadLyrics],
  );

  const extractFigures = useCallback(() => {
    extractSessionRef.current = null;
    setExtractPaused(false);
    runStream('/api/scan', 'GET', 'extract', loadResults);
  }, [runStream, loadResults]);

  const reExtract = useCallback(async () => {
    await fetch('/api/results', { method: 'DELETE' });
    setResults(null);
    extractSessionRef.current = null;
    setExtractPaused(false);
    extractFigures();
  }, [extractFigures]);

  const handleExtractClick = useCallback(() => {
    if (job === 'extract') {
      pauseExtract();
      return;
    }
    if (extractPaused) {
      resumeExtract();
      return;
    }
    if (results) reExtract();
    else extractFigures();
  }, [job, extractPaused, pauseExtract, resumeExtract, results, reExtract, extractFigures]);

  const syncSelectedLyrics = useCallback(() => {
    if (selectedTracks.size === 0) return;
    runStream('/api/lyrics', 'POST', 'lyrics', loadLyrics, selectionFromKeys(selectedTracks));
  }, [runStream, loadLyrics, selectedTracks]);

  const extractSelected = useCallback(() => {
    if (selectedTracks.size === 0) return;
    setExtractPaused(false);
    runStream(
      '/api/scan',
      'POST',
      'extract',
      loadResults,
      selectionFromKeys(selectedTracks),
    );
  }, [runStream, loadResults, selectedTracks]);

  const toggleTrack = (key: string) => {
    setSelectedTracks(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const toggleAlbum = (album: string, songs: string[]) => {
    const keys = albumTrackKeys(album, songs);
    const allSelected = keys.every(k => selectedTracks.has(k));
    setSelectedTracks(prev => {
      const next = new Set(prev);
      for (const k of keys) {
        if (allSelected) next.delete(k);
        else next.add(k);
      }
      return next;
    });
  };

  const toggleAlbumExpanded = (album: string) => {
    setExpandedAlbums(prev => {
      const next = new Set(prev);
      if (next.has(album)) next.delete(album);
      else next.add(album);
      return next;
    });
  };

  const selectFigure = (name: string) => {
    setSelectedFigure(name);
    setTab('detail');
  };

  const sortedFigures = results ? sortFigures(results.mentions, sortOrder) : [];
  const totalMentions = results ? Object.values(results.mentions).reduce((s, ms) => s + ms.length, 0) : 0;
  const lyricsRetrieved = lyrics?.parsed ?? 0;
  const figureCount = results ? Object.keys(results.mentions).length : 0;
  const hasLyrics = lyrics !== null && lyrics.parsed > 0;
  const busy = job !== null;
  const extractRunning = job === 'extract';
  const selectedCount = selectedTracks.size;
  const selectedWithLyrics = [...selectedTracks].filter(
    k => lyrics?.trackLyrics?.[k],
  ).length;

  const statusColor = apiStatus === 'ready' ? '#3A7B50' : apiStatus === 'busy' ? '#C9A84C' : '#cc4444';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden', background: '#0A0A0A' }}>
      {/* Header */}
      <header style={{
        background: '#0D0D0D',
        borderBottom: '1px solid #1E1E1E',
        padding: '12px 24px',
        display: 'flex',
        alignItems: 'center',
        gap: 24,
        flexShrink: 0,
      }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{
              background: statusColor,
              width: 8,
              height: 8,
              borderRadius: '50%',
              display: 'inline-block',
              boxShadow: `0 0 6px ${statusColor}`,
            }} />
            <span style={{ color: '#5A5A5A', fontSize: 10, letterSpacing: '0.15em', textTransform: 'uppercase' }}>
              OVO Intelligence
            </span>
          </div>
          <h1 style={{ color: '#C9A84C', fontSize: 20, fontFamily: 'Georgia, serif', marginTop: 2 }}>
            Drake Friend Tracker
          </h1>
          <div style={{ color: '#5A5A5A', fontSize: 11, marginTop: 2 }}>
            {TOTAL_SONGS} songs · {DRAKE_DISCOGRAPHY.length} albums
          </div>
        </div>

        <div style={{ flex: 1 }}>
          {(busy || extractPaused) && (
            <div style={{ maxWidth: 400 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <span style={{ color: '#5A5A5A', fontSize: 11 }}>
                  {job === 'lyrics'
                    ? 'Syncing lyrics…'
                    : extractPaused
                      ? 'Extraction paused'
                      : 'Extracting figures…'}
                </span>
                <span style={{ color: '#C9A84C', fontSize: 11 }}>{progress}%</span>
              </div>
              <div style={{ background: '#1A1A1A', height: 3, borderRadius: 2, overflow: 'hidden' }}>
                <div style={{
                  width: `${progress}%`,
                  height: '100%',
                  background: extractPaused ? '#5A5A5A' : '#C9A84C',
                  transition: 'width 0.3s ease',
                }} />
              </div>
            </div>
          )}
          {!busy && !extractPaused && lyrics && (
            <div style={{ color: '#5A5A5A', fontSize: 11 }}>
              Lyrics on disk: <span style={{ color: '#C9A84C' }}>{lyrics.parsed}</span> / {lyrics.totalSongs}
              {lyrics.syncedAt && (
                <span style={{ color: '#3A3A3A', marginLeft: 8 }}>
                  · synced {new Date(lyrics.syncedAt).toLocaleDateString()}
                </span>
              )}
            </div>
          )}
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={syncLyrics}
            disabled={busy}
            style={{
              background: busy && job !== 'lyrics' ? '#1A1A1A' : '#1E1E1E',
              color: busy && job !== 'lyrics' ? '#5A5A5A' : '#E8D5A3',
              border: '1px solid #2A2A2A',
              padding: '8px 16px',
              fontFamily: 'Georgia, serif',
              fontSize: 13,
              cursor: busy ? 'not-allowed' : 'pointer',
              borderRadius: 3,
            }}
          >
            {busy && job === 'lyrics' ? 'Syncing…' : hasLyrics ? 'Re-Sync Lyrics' : 'Sync Lyrics'}
          </button>
          <button
            onClick={handleExtractClick}
            disabled={(busy && job !== 'extract') || (!hasLyrics && !extractPaused)}
            title={
              extractRunning
                ? 'Pause extraction'
                : extractPaused
                  ? 'Resume extraction'
                  : !hasLyrics
                    ? 'Sync lyrics first'
                    : undefined
            }
            style={{
              background:
                (busy && job !== 'extract') || (!hasLyrics && !extractPaused)
                  ? '#1A1A1A'
                  : extractPaused
                    ? '#8B6830'
                    : '#C9A84C',
              color:
                (busy && job !== 'extract') || (!hasLyrics && !extractPaused)
                  ? '#5A5A5A'
                  : '#0A0A0A',
              border: 'none',
              padding: '8px 20px',
              fontFamily: 'Georgia, serif',
              fontSize: 13,
              cursor:
                (busy && job !== 'extract') || (!hasLyrics && !extractPaused)
                  ? 'not-allowed'
                  : 'pointer',
              borderRadius: 3,
              letterSpacing: '0.05em',
            }}
          >
            {extractRunning
              ? 'Pause'
              : extractPaused
                ? 'Resume'
                : results
                  ? 'Re-Extract'
                  : 'Extract Figures'}
          </button>
        </div>
      </header>

      {/* Body */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* Sidebar */}
        <aside style={{
          width: 260,
          flexShrink: 0,
          borderRight: '1px solid #1E1E1E',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}>
          {/* Log */}
          <div style={{ borderBottom: '1px solid #1E1E1E', padding: '8px 12px 6px' }}>
            <span style={{ color: '#5A5A5A', fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase' }}>Live Log</span>
          </div>
          <div
            ref={logRef}
            style={{
              flex: '0 0 180px',
              overflowY: 'auto',
              padding: '8px 12px',
              borderBottom: '1px solid #1E1E1E',
              fontFamily: 'monospace',
              fontSize: 10,
              lineHeight: 1.6,
            }}
          >
            {log.length === 0 && (
              <div style={{ color: '#3A3A3A' }}>No job in progress.</div>
            )}
            {log.map((entry, i) => (
              <div key={i} style={{ color: entry.color, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                {entry.text}
              </div>
            ))}
          </div>

          {/* Sort */}
          <div style={{ padding: '8px 12px', borderBottom: '1px solid #1E1E1E', display: 'flex', gap: 6 }}>
            {(['count', 'alpha', 'earliest'] as SortOrder[]).map(s => (
              <button
                key={s}
                onClick={() => setSortOrder(s)}
                style={{
                  background: sortOrder === s ? '#C9A84C' : '#1A1A1A',
                  color: sortOrder === s ? '#0A0A0A' : '#5A5A5A',
                  border: 'none',
                  padding: '3px 8px',
                  fontSize: 10,
                  cursor: 'pointer',
                  borderRadius: 2,
                  textTransform: 'capitalize',
                  fontFamily: 'Georgia, serif',
                }}
              >
                {s === 'count' ? '#' : s === 'alpha' ? 'A–Z' : 'Year'}
              </button>
            ))}
          </div>

          {/* Figure list */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '4px 0' }}>
            {sortedFigures.length === 0 && (
              <div style={{ color: '#3A3A3A', fontSize: 11, padding: '12px', fontStyle: 'italic' }}>
                {results ? 'No figures extracted yet.' : 'Extract figures to populate the list.'}
              </div>
            )}
            {sortedFigures.map(([figure, ms]) => (
              <button
                key={figure}
                onClick={() => selectFigure(figure)}
                style={{
                  width: '100%',
                  background: selectedFigure === figure ? '#1A1A1A' : 'transparent',
                  border: 'none',
                  borderLeft: selectedFigure === figure ? '2px solid #C9A84C' : '2px solid transparent',
                  padding: '6px 12px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  cursor: 'pointer',
                  textAlign: 'left',
                }}
              >
                <span style={{ color: '#E8D5A3', fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                  {figure}
                </span>
                <span style={{
                  background: '#1E1E1E',
                  color: '#C9A84C',
                  fontSize: 10,
                  padding: '1px 6px',
                  borderRadius: 10,
                  marginLeft: 8,
                  flexShrink: 0,
                }}>
                  {ms.length}
                </span>
              </button>
            ))}
          </div>
        </aside>

        {/* Main */}
        <main style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {/* Tabs */}
          <div style={{ borderBottom: '1px solid #1E1E1E', display: 'flex', gap: 0, flexShrink: 0 }}>
            {(['overview', 'timeline', 'detail', 'retrack'] as Tab[]).map(t => (
              <button
                key={t}
                onClick={() => setTab(t)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  borderBottom: tab === t ? '2px solid #C9A84C' : '2px solid transparent',
                  color: tab === t ? '#C9A84C' : '#5A5A5A',
                  padding: '10px 24px',
                  cursor: 'pointer',
                  fontSize: 12,
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                  fontFamily: 'Georgia, serif',
                }}
              >
                {t === 'retrack' ? 'Retrack' : t}
              </button>
            ))}
          </div>

          {/* Tab content */}
          <div style={{ flex: 1, overflowY: 'auto', padding: 24 }}>
            {/* OVERVIEW */}
            {tab === 'overview' && (
              <div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 24 }}>
                  <StatCard label="Figures Found" value={figureCount} />
                  <StatCard label="Total Mentions" value={totalMentions} />
                  <StatCard label="Songs Processed" value={results?.songsProcessed ?? 0} />
                  <StatCard label="Lyrics on Disk" value={lyricsRetrieved} />
                </div>

                {results && Object.keys(results.mentions).length > 0 && (
                  <BarChart mentions={results.mentions} onSelect={selectFigure} />
                )}

                {lyrics && lyrics.failedSongs.length > 0 && (
                  <div style={{ marginTop: 32 }}>
                    <div style={{ color: '#5A5A5A', fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 12 }}>
                      Songs Without Lyrics ({lyrics.failedSongs.length})
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                      {lyrics.failedSongs.map((s, i) => (
                        <span key={i} style={{
                          background: '#141414',
                          border: '1px solid #2A2A2A',
                          color: '#5A5A5A',
                          fontSize: 11,
                          padding: '3px 10px',
                          borderRadius: 3,
                        }}>
                          {s.song} <span style={{ color: '#3A3A3A' }}>· {s.album}</span>
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {!results && !busy && (
                  <div style={{ textAlign: 'center', marginTop: 80, color: '#3A3A3A' }}>
                    <div style={{ fontSize: 48, marginBottom: 16 }}>◉</div>
                    <div style={{ fontSize: 16, color: '#5A5A5A', fontStyle: 'italic' }}>
                      {hasLyrics
                        ? 'Lyrics ready. Run Extract Figures to analyze mentions.'
                        : 'Sync lyrics once, then extract figures.'}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* TIMELINE */}
            {tab === 'timeline' && (
              <div>
                {!results && (
                  <div style={{ color: '#3A3A3A', fontStyle: 'italic' }}>No extraction data yet.</div>
                )}
                {results && DRAKE_DISCOGRAPHY.map(({ album, year }) => {
                  const color = ALBUM_COLORS[album] || '#5A5A5A';
                  // Find all figures mentioned in this album
                  const albumFigures: Record<string, number> = {};
                  for (const [figure, ms] of Object.entries(results.mentions)) {
                    const count = ms.filter(m => m.album === album).length;
                    if (count > 0) albumFigures[figure] = count;
                  }
                  const figureEntries = Object.entries(albumFigures).sort((a, b) => b[1] - a[1]);

                  return (
                    <div key={album} style={{ marginBottom: 32, borderLeft: `3px solid ${color}`, paddingLeft: 20 }}>
                      <div style={{ marginBottom: 12 }}>
                        <div style={{ color: color, fontSize: 16, fontFamily: 'Georgia, serif' }}>{album}</div>
                        <div style={{ color: '#5A5A5A', fontSize: 11, marginTop: 2 }}>{year}</div>
                      </div>
                      {figureEntries.length === 0 ? (
                        <div style={{ color: '#3A3A3A', fontSize: 11, fontStyle: 'italic' }}>No figures extracted</div>
                      ) : (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                          {figureEntries.map(([figure, count]) => (
                            <button
                              key={figure}
                              onClick={() => selectFigure(figure)}
                              style={{
                                background: color + '18',
                                border: `1px solid ${color}44`,
                                color: '#E8D5A3',
                                fontSize: 12,
                                padding: '4px 10px',
                                borderRadius: 3,
                                cursor: 'pointer',
                                fontFamily: 'Georgia, serif',
                              }}
                            >
                              {figure}
                              <span style={{ color: color, marginLeft: 6 }}>{count}</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* RETRACK */}
            {tab === 'retrack' && (
              <div>
                <p style={{ color: '#5A5A5A', fontSize: 13, marginBottom: 20, maxWidth: 560, lineHeight: 1.5 }}>
                  Select albums or individual songs to re-sync lyrics or re-extract figures.
                  Only selected tracks use API tokens.
                </p>

                <div style={{ display: 'flex', gap: 8, marginBottom: 24, flexWrap: 'wrap', alignItems: 'center' }}>
                  <button
                    onClick={syncSelectedLyrics}
                    disabled={busy || selectedCount === 0}
                    style={{
                      background: busy || selectedCount === 0 ? '#1A1A1A' : '#1E1E1E',
                      color: busy || selectedCount === 0 ? '#5A5A5A' : '#E8D5A3',
                      border: '1px solid #2A2A2A',
                      padding: '8px 16px',
                      fontFamily: 'Georgia, serif',
                      fontSize: 13,
                      cursor: busy || selectedCount === 0 ? 'not-allowed' : 'pointer',
                      borderRadius: 3,
                    }}
                  >
                    Sync lyrics ({selectedCount})
                  </button>
                  <button
                    onClick={extractRunning ? pauseExtract : extractSelected}
                    disabled={(busy && !extractRunning) || selectedWithLyrics === 0}
                    title={
                      selectedWithLyrics === 0 && selectedCount > 0
                        ? 'Sync lyrics for selected songs first'
                        : undefined
                    }
                    style={{
                      background: busy || selectedWithLyrics === 0 ? '#1A1A1A' : '#C9A84C',
                      color: busy || selectedWithLyrics === 0 ? '#5A5A5A' : '#0A0A0A',
                      border: 'none',
                      padding: '8px 20px',
                      fontFamily: 'Georgia, serif',
                      fontSize: 13,
                      cursor: busy || selectedWithLyrics === 0 ? 'not-allowed' : 'pointer',
                      borderRadius: 3,
                    }}
                  >
                    {extractRunning
                      ? 'Pause'
                      : `Extract figures (${selectedWithLyrics})`}
                  </button>
                  {selectedCount > 0 && (
                    <button
                      onClick={() => setSelectedTracks(new Set())}
                      disabled={busy}
                      style={{
                        background: 'transparent',
                        color: '#5A5A5A',
                        border: 'none',
                        fontSize: 12,
                        cursor: busy ? 'not-allowed' : 'pointer',
                        fontFamily: 'Georgia, serif',
                        textDecoration: 'underline',
                      }}
                    >
                      Clear selection
                    </button>
                  )}
                </div>

                <div style={{ maxWidth: 720 }}>
                  {DRAKE_DISCOGRAPHY.map(({ album, year, songs }) => {
                    const color = ALBUM_COLORS[album] || '#5A5A5A';
                    const keys = albumTrackKeys(album, songs);
                    const selectedInAlbum = keys.filter(k => selectedTracks.has(k)).length;
                    const albumChecked = selectedInAlbum === songs.length;
                    const albumIndeterminate = selectedInAlbum > 0 && !albumChecked;
                    const expanded = expandedAlbums.has(album);

                    return (
                      <div
                        key={album}
                        style={{
                          marginBottom: 8,
                          border: '1px solid #1E1E1E',
                          borderRadius: 4,
                          overflow: 'hidden',
                        }}
                      >
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 10,
                            padding: '10px 14px',
                            background: '#111',
                            borderLeft: `3px solid ${color}`,
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={albumChecked}
                            ref={el => {
                              if (el) el.indeterminate = albumIndeterminate;
                            }}
                            onChange={() => toggleAlbum(album, songs)}
                            disabled={busy}
                            style={{ accentColor: color, cursor: busy ? 'not-allowed' : 'pointer' }}
                          />
                          <button
                            type="button"
                            onClick={() => toggleAlbumExpanded(album)}
                            style={{
                              flex: 1,
                              background: 'transparent',
                              border: 'none',
                              textAlign: 'left',
                              cursor: 'pointer',
                              padding: 0,
                            }}
                          >
                            <span style={{ color, fontFamily: 'Georgia, serif', fontSize: 14 }}>{album}</span>
                            <span style={{ color: '#5A5A5A', fontSize: 11, marginLeft: 10 }}>{year}</span>
                            <span style={{ color: '#3A3A3A', fontSize: 11, marginLeft: 8 }}>
                              {songs.length} songs
                              {selectedInAlbum > 0 && (
                                <span style={{ color: '#C9A84C', marginLeft: 6 }}>· {selectedInAlbum} selected</span>
                              )}
                            </span>
                          </button>
                          <span style={{ color: '#3A3A3A', fontSize: 12 }}>{expanded ? '▾' : '▸'}</span>
                        </div>

                        {expanded && (
                          <div style={{ padding: '4px 14px 10px 36px' }}>
                            {songs.map(song => {
                              const key = trackKey(song, album);
                              const hasTrackLyrics = lyrics?.trackLyrics?.[key];
                              return (
                                <label
                                  key={key}
                                  style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 8,
                                    padding: '4px 0',
                                    cursor: busy ? 'not-allowed' : 'pointer',
                                    opacity: busy ? 0.6 : 1,
                                  }}
                                >
                                  <input
                                    type="checkbox"
                                    checked={selectedTracks.has(key)}
                                    onChange={() => toggleTrack(key)}
                                    disabled={busy}
                                    style={{ accentColor: color }}
                                  />
                                  <span style={{ color: '#E8D5A3', fontSize: 12, flex: 1 }}>{song}</span>
                                  {lyrics && (
                                    <span style={{
                                      fontSize: 10,
                                      color: hasTrackLyrics ? '#3A7B50' : '#5A5A5A',
                                    }}>
                                      {hasTrackLyrics ? 'lyrics' : 'no lyrics'}
                                    </span>
                                  )}
                                </label>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* DETAIL */}
            {tab === 'detail' && (
              <div>
                {!selectedFigure && (
                  <div style={{ color: '#3A3A3A', fontStyle: 'italic' }}>
                    Select a figure from the sidebar or click a name in the Overview/Timeline tabs.
                  </div>
                )}
                {selectedFigure && results && results.mentions[selectedFigure] && (() => {
                  const ms = results.mentions[selectedFigure];
                  const sorted = [...ms].sort((a, b) => a.year - b.year || a.album.localeCompare(b.album));
                  const albums = [...new Set(ms.map(m => m.album))];
                  const years = ms.map(m => m.year);
                  const minYear = Math.min(...years);
                  const maxYear = Math.max(...years);

                  return (
                    <div>
                      <h2 style={{ color: '#C9A84C', fontSize: 28, fontFamily: 'Georgia, serif', marginBottom: 8 }}>
                        {selectedFigure}
                      </h2>
                      <div style={{ display: 'flex', gap: 20, marginBottom: 32, color: '#5A5A5A', fontSize: 12 }}>
                        <span><span style={{ color: '#C9A84C' }}>{ms.length}</span> mention{ms.length !== 1 ? 's' : ''}</span>
                        <span><span style={{ color: '#C9A84C' }}>{albums.length}</span> album{albums.length !== 1 ? 's' : ''}</span>
                        <span><span style={{ color: '#C9A84C' }}>{minYear === maxYear ? minYear : `${minYear}–${maxYear}`}</span></span>
                      </div>

                      {sorted.map((mention, i) => {
                        const color = ALBUM_COLORS[mention.album] || '#5A5A5A';
                        return (
                          <div key={i} style={{
                            marginBottom: 16,
                            borderLeft: `3px solid ${color}`,
                            paddingLeft: 16,
                            paddingTop: 4,
                            paddingBottom: 4,
                          }}>
                            <div style={{ display: 'flex', gap: 12, marginBottom: 6, alignItems: 'center' }}>
                              <span style={{ color: color, fontSize: 12 }}>{mention.album}</span>
                              <span style={{ color: '#3A3A3A', fontSize: 11 }}>·</span>
                              <span style={{ color: '#5A5A5A', fontSize: 11 }}>{mention.year}</span>
                              <span style={{ color: '#3A3A3A', fontSize: 11 }}>·</span>
                              <span style={{ color: '#8A7A5A', fontSize: 12 }}>{mention.song}</span>
                            </div>
                            <div style={{ color: '#E8D5A3', fontSize: 13, fontStyle: 'italic', lineHeight: 1.6 }}>
                              &ldquo;{mention.bar}&rdquo;
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
