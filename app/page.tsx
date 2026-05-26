'use client';

import Link from 'next/link';
import { useEffect, useRef, useState, useCallback, type CSSProperties } from 'react';
import { DRAKE_DISCOGRAPHY, ALBUM_COLORS, TOTAL_SONGS } from '@/lib/discography';
import { randomDrakeQuote } from '@/lib/drake-quotes';
import {
  DEMO_LYRICS_REPLAY_MS,
  DEMO_SCAN_REPLAY_MS,
  fetchDemoLyricsEvents,
  fetchDemoScanEvents,
  isClientDemoMode,
  sleep,
  type ScanStreamEvent,
} from '@/lib/demo-replay';
import { formatScanEvent } from '@/lib/scan-log';
import { mentionKey } from '@/lib/mention-key';
import { trackKey } from '@/lib/tracks';

// ── Types ──────────────────────────────────────────────────────────────────────

interface Mention {
  friend: string;
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

type ReviewStatus = 'correct' | 'incomplete' | 'false_positive';

interface MentionReview {
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

interface TrackSelectionBody {
  albums?: string[];
  tracks: Array<{ song: string; album: string }>;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function logColor(type: string): string {
  if (type === 'lyrics_ok') return '#C9A84C';
  if (type === 'lyrics_fail') return '#cc4444';
  if (type === 'friends') return '#E8D5A3';
  if (type === 'done') return '#C9A84C';
  if (type === 'paused') return '#C9A84C';
  if (type === 'error') return '#cc4444';
  return '#5A5A5A';
}

function sortFriends(mentions: Record<string, Mention[]>, order: SortOrder): [string, Mention[]][] {
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

const reviewBtnStyle: CSSProperties = {
  background: 'transparent',
  border: '1px solid #2A2A2A',
  color: '#5A5A5A',
  fontSize: 10,
  padding: '4px 8px',
  cursor: 'pointer',
  borderRadius: 2,
  letterSpacing: '0.05em',
  textTransform: 'uppercase',
};

function MentionReviewRow({
  mention,
  review,
  onSave,
  editingKey,
  setEditingKey,
}: {
  mention: Mention;
  review?: MentionReview;
  onSave: (payload: {
    status: ReviewStatus;
    correctedFriend?: string;
    correctedBar?: string;
    notes?: string;
  }) => Promise<void>;
  editingKey: string | null;
  setEditingKey: (key: string | null) => void;
}) {
  const key = mentionKey(mention);
  const isEditing = editingKey === key;
  const [correctedFriend, setCorrectedFriend] = useState(mention.friend);
  const [correctedBar, setCorrectedBar] = useState(mention.bar);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const color = ALBUM_COLORS[mention.album] || '#5A5A5A';
  const isFalsePositive = review?.status === 'false_positive';
  const isIncomplete = review?.status === 'incomplete';
  const isCorrect = review?.status === 'correct';

  const handleSave = async (status: ReviewStatus) => {
    setSaving(true);
    setSaveError(null);
    try {
      await onSave({
        status,
        ...(status === 'incomplete'
          ? {
              correctedFriend: correctedFriend.trim() || undefined,
              correctedBar: correctedBar.trim() || undefined,
              notes: notes.trim() || undefined,
            }
          : {}),
      });
      if (status !== 'incomplete') setEditingKey(null);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'Could not save review';
      setSaveError(message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      style={{
        marginBottom: 16,
        borderLeft: `3px solid ${color}`,
        paddingLeft: 16,
        paddingTop: 4,
        paddingBottom: 4,
        opacity: isFalsePositive ? 0.45 : 1,
      }}
    >
      <div style={{ display: 'flex', gap: 12, marginBottom: 6, alignItems: 'center', flexWrap: 'wrap' }}>
        <span style={{ color: color, fontSize: 12 }}>{mention.album}</span>
        <span style={{ color: '#3A3A3A', fontSize: 11 }}>·</span>
        <span style={{ color: '#5A5A5A', fontSize: 11 }}>{mention.year}</span>
        <span style={{ color: '#3A3A3A', fontSize: 11 }}>·</span>
        <span style={{ color: '#8A7A5A', fontSize: 12 }}>{mention.song}</span>
        {isCorrect && (
          <span style={{ color: '#6A8A6A', fontSize: 10, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
            Reviewed
          </span>
        )}
        {isIncomplete && (
          <span style={{ color: '#C9A84C', fontSize: 10, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
            Needs fix
          </span>
        )}
        {isFalsePositive && (
          <span style={{ color: '#8A5A5A', fontSize: 10, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
            False positive
          </span>
        )}
      </div>
      <div
        style={{
          color: '#E8D5A3',
          fontSize: 13,
          fontStyle: 'italic',
          lineHeight: 1.6,
          textDecoration: isFalsePositive ? 'line-through' : 'none',
          marginBottom: 8,
        }}
      >
        &ldquo;{mention.bar}&rdquo;
      </div>
      {isIncomplete && (review?.correctedFriend || review?.correctedBar) && (
        <div style={{ color: '#C9A84C', fontSize: 11, marginBottom: 8, lineHeight: 1.5 }}>
          {review.correctedFriend && review.correctedFriend !== mention.friend && (
            <div>Friend: {review.correctedFriend}</div>
          )}
          {review.correctedBar && review.correctedBar !== mention.bar && (
            <div>Bar: &ldquo;{review.correctedBar}&rdquo;</div>
          )}
          {review.notes && <div>{review.notes}</div>}
        </div>
      )}
      {isEditing && (
        <div style={{ marginBottom: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
          <input
            value={correctedFriend}
            onChange={e => setCorrectedFriend(e.target.value)}
            placeholder="Corrected friend name"
            style={{
              background: '#141414',
              border: '1px solid #2A2A2A',
              color: '#E8D5A3',
              fontSize: 11,
              padding: '6px 8px',
            }}
          />
          <input
            value={correctedBar}
            onChange={e => setCorrectedBar(e.target.value)}
            placeholder="Corrected bar"
            style={{
              background: '#141414',
              border: '1px solid #2A2A2A',
              color: '#E8D5A3',
              fontSize: 11,
              padding: '6px 8px',
            }}
          />
          <input
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder="Notes (optional)"
            style={{
              background: '#141414',
              border: '1px solid #2A2A2A',
              color: '#5A5A5A',
              fontSize: 11,
              padding: '6px 8px',
            }}
          />
        </div>
      )}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
        <button
          type="button"
          disabled={saving}
          onClick={() => handleSave('correct')}
          style={{
            ...reviewBtnStyle,
            borderColor: isCorrect ? '#6A8A6A' : '#2A2A2A',
            color: isCorrect ? '#6A8A6A' : '#5A5A5A',
          }}
        >
          Correct
        </button>
        {isEditing ? (
          <>
            <button
              type="button"
              disabled={saving}
              onClick={() => handleSave('incomplete')}
              style={{ ...reviewBtnStyle, borderColor: '#C9A84C', color: '#C9A84C' }}
            >
              Save
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={() => setEditingKey(null)}
              style={reviewBtnStyle}
            >
              Cancel
            </button>
          </>
        ) : (
          <button
            type="button"
            disabled={saving}
            onClick={() => {
              setCorrectedFriend(review?.correctedFriend ?? mention.friend);
              setCorrectedBar(review?.correctedBar ?? mention.bar);
              setNotes(review?.notes ?? '');
              setEditingKey(key);
            }}
            style={{
              ...reviewBtnStyle,
              borderColor: isIncomplete ? '#C9A84C' : '#2A2A2A',
              color: isIncomplete ? '#C9A84C' : '#5A5A5A',
            }}
          >
            Incomplete
          </button>
        )}
        <button
          type="button"
          disabled={saving}
          onClick={() => handleSave('false_positive')}
          style={{
            ...reviewBtnStyle,
            borderColor: isFalsePositive ? '#8A5A5A' : '#2A2A2A',
            color: isFalsePositive ? '#8A5A5A' : '#5A5A5A',
          }}
        >
          False positive
        </button>
      </div>
      {saveError && (
        <div style={{ color: '#cc4444', fontSize: 11, marginTop: 8, lineHeight: 1.4 }}>
          {saveError}
        </div>
      )}
    </div>
  );
}

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
      <div style={{ color: '#5A5A5A', fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 16 }}>Top Friends by Mentions</div>
      {sorted.map(([friend, ms]) => {
        const albums = [...new Set(ms.map(m => m.album))];
        const pct = (ms.length / max) * 100;
        return (
          <div
            key={friend}
            onClick={() => onSelect(friend)}
            style={{ marginBottom: 10, cursor: 'pointer' }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
              <span style={{ color: '#E8D5A3', fontSize: 13 }}>{friend}</span>
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
  const [selectedFriend, setSelectedFriend] = useState<string | null>(null);
  const [reviews, setReviews] = useState<Record<string, MentionReview>>({});
  const [reviewsStorage, setReviewsStorage] = useState<'blob' | 'disk' | null>(null);
  const [editingReviewKey, setEditingReviewKey] = useState<string | null>(null);
  const [selectedTracks, setSelectedTracks] = useState<Set<string>>(new Set());
  const [expandedAlbums, setExpandedAlbums] = useState<Set<string>>(new Set());
  const [apiStatus, setApiStatus] = useState<'ready' | 'busy' | 'error'>('ready');
  const [extractPaused, setExtractPaused] = useState(false);
  const [drakeQuote] = useState(randomDrakeQuote);
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

  const loadReviews = useCallback(() => {
    return fetch('/api/reviews')
      .then(r => r.json())
      .then(data => {
        if (data.data?.reviews) setReviews(data.data.reviews);
        else setReviews({});
        if (data.storage === 'blob' || data.storage === 'disk') {
          setReviewsStorage(data.storage);
        }
      })
      .catch(() => {});
  }, []);

  const saveReview = useCallback(
    async (
      mention: Mention,
      payload: {
        status: ReviewStatus;
        correctedFriend?: string;
        correctedBar?: string;
        notes?: string;
      },
    ) => {
      const key = mentionKey(mention);
      const res = await fetch('/api/reviews', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mentionKey: key,
          status: payload.status,
          friend: mention.friend,
          bar: mention.bar,
          song: mention.song,
          album: mention.album,
          year: mention.year,
          correctedFriend: payload.correctedFriend,
          correctedBar: payload.correctedBar,
          notes: payload.notes,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(
          typeof data.error === 'string' ? data.error : 'Could not save review',
        );
      }
      const data = await res.json();
      if (data.review) {
        setReviews(prev => ({ ...prev, [key]: data.review }));
      }
    },
    [],
  );

  useEffect(() => {
    loadLyrics();
    loadResults();
    loadReviews();
  }, [loadLyrics, loadResults, loadReviews]);

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
                if (event.type === 'friends' || event.type === 'no_friends') {
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
              text: 'Paused — click Scan Mentions to resume',
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

  const runDemoStreamReplay = useCallback(
    async (
      kind: JobKind,
      loadEvents: () => Promise<ScanStreamEvent[]>,
      eventMs: number,
      onDone?: () => Promise<void>,
      opts?: { appendLog?: boolean },
    ) => {
      if (job) return;

      const appendLog = opts?.appendLog === true;
      setJob(kind);
      setApiStatus('busy');
      if (kind === 'extract') {
        setExtractPaused(false);
        extractSessionRef.current = { scopeTracks: null, processedKeys: new Set() };
      }
      if (!appendLog) {
        setLog([]);
      }
      if (!appendLog || kind === 'extract') {
        setProgress(0);
      }

      const abort = new AbortController();
      abortRef.current = abort;

      try {
        const events = await loadEvents();
        for (const event of events) {
          if (abort.signal.aborted) break;

          const text = formatScanEvent(event);
          if (text) {
            const color = logColor(event.type as string);
            setLog(prev => [...prev, { type: event.type as string, text, color }]);
          }

          if (kind === 'extract') {
            if (event.type === 'extract') {
              inFlightExtractRef.current = {
                song: event.song as string,
                album: event.album as string,
              };
            }
            if (event.type === 'friends' || event.type === 'no_friends') {
              const inflight = inFlightExtractRef.current;
              if (inflight && inflight.song === event.song) {
                markExtractProcessed(inflight.song, inflight.album);
              }
            }
          }

          if (event.type === 'progress') {
            const total = event.total as number;
            setProgress(Math.round(((event.completed as number) / total) * 100));
          }
          if (event.type === 'done') {
            setProgress(100);
            if (kind === 'extract') extractSessionRef.current = null;
            if (onDone) await onDone();
            setApiStatus('ready');
          }
          if (event.type === 'error') {
            setApiStatus('error');
          }

          await sleep(eventMs, abort.signal);
        }
      } catch (e: unknown) {
        const err = e as Error;
        if (err.name !== 'AbortError') {
          setLog(prev => [
            ...prev,
            { type: 'error', text: `Demo replay failed: ${err.message}`, color: '#cc4444' },
          ]);
          setApiStatus('error');
        }
      } finally {
        setJob(null);
        setApiStatus(prev => (prev === 'busy' ? 'ready' : prev));
      }
    },
    [job, markExtractProcessed],
  );

  const runDemoLyricsReplay = useCallback(
    (onDone?: () => Promise<void>, opts?: { appendLog?: boolean }) =>
      runDemoStreamReplay('lyrics', fetchDemoLyricsEvents, DEMO_LYRICS_REPLAY_MS, onDone, opts),
    [runDemoStreamReplay],
  );

  const runDemoScanReplay = useCallback(
    (onDone?: () => Promise<void>, opts?: { appendLog?: boolean }) =>
      runDemoStreamReplay('extract', fetchDemoScanEvents, DEMO_SCAN_REPLAY_MS, onDone, opts),
    [runDemoStreamReplay],
  );

  const runFullDemoReplay = useCallback(async () => {
    await runDemoLyricsReplay(loadLyrics);
    await runDemoScanReplay(loadResults, { appendLog: true });
  }, [runDemoLyricsReplay, runDemoScanReplay, loadLyrics, loadResults]);

  const pauseExtract = useCallback(() => {
    if (job !== 'extract') return;
    pauseRequestedRef.current = true;
    abortRef.current?.abort();
  }, [job]);

  const resumeExtract = useCallback(() => {
    if (isClientDemoMode) {
      runDemoScanReplay(loadResults);
      return;
    }

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
  }, [runStream, runDemoScanReplay, loadResults, lyrics]);

  const syncLyrics = useCallback(() => {
    if (isClientDemoMode) {
      runDemoLyricsReplay(loadLyrics);
      return;
    }
    runStream('/api/lyrics', 'POST', 'lyrics', loadLyrics);
  }, [runStream, runDemoLyricsReplay, loadLyrics]);

  const extractFriends = useCallback(() => {
    extractSessionRef.current = null;
    setExtractPaused(false);
    if (isClientDemoMode) {
      runFullDemoReplay();
      return;
    }
    runStream('/api/scan', 'GET', 'extract', loadResults);
  }, [runStream, runFullDemoReplay, loadResults]);

  const reExtract = useCallback(async () => {
    extractSessionRef.current = null;
    setExtractPaused(false);

    if (isClientDemoMode) {
      runDemoScanReplay(loadResults);
      return;
    }

    const keysWithLyrics = lyrics
      ? [...selectedTracks].filter(k => lyrics.trackLyrics?.[k])
      : [];
    if (keysWithLyrics.length > 0) {
      runStream(
        '/api/scan',
        'POST',
        'extract',
        loadResults,
        selectionFromKeys(keysWithLyrics),
      );
      return;
    }

    await fetch('/api/results', { method: 'DELETE' });
    setResults(null);
    extractFriends();
  }, [extractFriends, runStream, runDemoScanReplay, loadResults, selectedTracks, lyrics]);

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
    else extractFriends();
  }, [job, extractPaused, pauseExtract, resumeExtract, results, reExtract, extractFriends]);

  const syncSelectedLyrics = useCallback(() => {
    if (selectedTracks.size === 0) return;
    runStream('/api/lyrics', 'POST', 'lyrics', loadLyrics, selectionFromKeys(selectedTracks));
  }, [runStream, loadLyrics, selectedTracks]);

  const extractSelected = useCallback(() => {
    if (selectedTracks.size === 0) return;
    setExtractPaused(false);
    if (isClientDemoMode) {
      runDemoScanReplay(loadResults);
      return;
    }
    runStream(
      '/api/scan',
      'POST',
      'extract',
      loadResults,
      selectionFromKeys(selectedTracks),
    );
  }, [runStream, runDemoScanReplay, loadResults, selectedTracks]);

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

  const selectFriend = (name: string) => {
    setSelectedFriend(name);
    setTab('detail');
  };

  const sortedFriends = results ? sortFriends(results.mentions, sortOrder) : [];
  const totalMentions = results ? Object.values(results.mentions).reduce((s, ms) => s + ms.length, 0) : 0;
  const lyricsRetrieved = lyrics?.parsed ?? 0;
  const friendCount = results ? Object.keys(results.mentions).length : 0;
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
              OVO Intelligence{isClientDemoMode ? ' · Demo' : ''}
            </span>
          </div>
          <h1 style={{ color: '#C9A84C', fontSize: 20, fontFamily: 'Georgia, serif', marginTop: 2 }}>
            Drake Friend Tracker
          </h1>
          <div style={{ color: '#5A5A5A', fontSize: 11, marginTop: 2 }}>
            {TOTAL_SONGS} songs · {DRAKE_DISCOGRAPHY.length} albums
            {' · '}
            <Link href="/dev/annotate" style={{ color: '#3A3A3A', textDecoration: 'none' }}>
              dev
            </Link>
          </div>
          {isClientDemoMode && (
            <div
              style={{
                color: reviewsStorage === 'disk' ? '#C9A84C' : '#6A8A6A',
                fontSize: 10,
                marginTop: 4,
                maxWidth: 360,
                lineHeight: 1.4,
              }}
            >
              {reviewsStorage === 'blob'
                ? 'Shared review storage connected — mark mentions and everyone will see your feedback.'
                : reviewsStorage === 'disk'
                  ? 'Redeploy after linking Blob so review buttons can save.'
                  : 'Mark mentions correct, incomplete, or false positive — reviews improve future scans.'}
            </div>
          )}
        </div>

        <div style={{ flex: 1 }}>
          <div style={{
            color: '#8B7A50',
            fontSize: 12,
            fontStyle: 'italic',
            fontFamily: 'Georgia, serif',
            marginBottom: busy || extractPaused || lyrics ? 8 : 0,
            maxWidth: 420,
          }}>
            &ldquo;{drakeQuote}&rdquo;
          </div>
          {(busy || extractPaused) && (
            <div style={{ maxWidth: 400 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <span style={{ color: '#5A5A5A', fontSize: 11 }}>
                  {job === 'lyrics'
                    ? 'Syncing lyrics…'
                    : extractPaused
                      ? 'Scan paused'
                      : 'Scanning mentions…'}
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
            title={isClientDemoMode ? 'Replay full discography lyrics sync' : undefined}
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
            {busy && job === 'lyrics'
              ? 'Syncing…'
              : isClientDemoMode
                ? hasLyrics
                  ? 'Replay lyrics sync'
                  : 'Sync Lyrics (demo)'
                : hasLyrics
                  ? 'Re-Sync Lyrics'
                  : 'Sync Lyrics'}
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
                : isClientDemoMode
                  ? results
                    ? 'Replay scan'
                    : 'Run full demo'
                  : results
                    ? selectedWithLyrics > 0
                      ? `Re-Scan (${selectedWithLyrics})`
                      : 'Re-Scan All'
                    : 'Scan Mentions'}
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

          {/* Friend list */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '4px 0' }}>
            {sortedFriends.length === 0 && (
              <div style={{ color: '#3A3A3A', fontSize: 11, padding: '12px', fontStyle: 'italic' }}>
                {results ? 'No mentions found yet.' : 'Scan mentions to populate the list.'}
              </div>
            )}
            {sortedFriends.map(([friend, ms]) => (
              <button
                key={friend}
                onClick={() => selectFriend(friend)}
                style={{
                  width: '100%',
                  background: selectedFriend === friend ? '#1A1A1A' : 'transparent',
                  border: 'none',
                  borderLeft: selectedFriend === friend ? '2px solid #C9A84C' : '2px solid transparent',
                  padding: '6px 12px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  cursor: 'pointer',
                  textAlign: 'left',
                }}
              >
                <span style={{ color: '#E8D5A3', fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                  {friend}
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
                  <StatCard label="Friends Found" value={friendCount} />
                  <StatCard label="Total Mentions" value={totalMentions} />
                  <StatCard label="Songs Processed" value={results?.songsProcessed ?? 0} />
                  <StatCard label="Lyrics on Disk" value={lyricsRetrieved} />
                </div>

                {results && Object.keys(results.mentions).length > 0 && (
                  <BarChart mentions={results.mentions} onSelect={selectFriend} />
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
                        ? 'Lyrics ready. Run Scan Mentions to analyze lyrics.'
                        : 'Sync lyrics once, then scan mentions.'}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* TIMELINE */}
            {tab === 'timeline' && (
              <div>
                {!results && (
                  <div style={{ color: '#3A3A3A', fontStyle: 'italic' }}>No scan data yet.</div>
                )}
                {results && DRAKE_DISCOGRAPHY.map(({ album, year }) => {
                  const color = ALBUM_COLORS[album] || '#5A5A5A';
                  // Find all friends mentioned in this album
                  const albumFriends: Record<string, number> = {};
                  for (const [friend, ms] of Object.entries(results.mentions)) {
                    const count = ms.filter(m => m.album === album).length;
                    if (count > 0) albumFriends[friend] = count;
                  }
                  const friendEntries = Object.entries(albumFriends).sort((a, b) => b[1] - a[1]);

                  return (
                    <div key={album} style={{ marginBottom: 32, borderLeft: `3px solid ${color}`, paddingLeft: 20 }}>
                      <div style={{ marginBottom: 12 }}>
                        <div style={{ color: color, fontSize: 16, fontFamily: 'Georgia, serif' }}>{album}</div>
                        <div style={{ color: '#5A5A5A', fontSize: 11, marginTop: 2 }}>{year}</div>
                      </div>
                      {friendEntries.length === 0 ? (
                        <div style={{ color: '#3A3A3A', fontSize: 11, fontStyle: 'italic' }}>No mentions found</div>
                      ) : (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                          {friendEntries.map(([friend, count]) => (
                            <button
                              key={friend}
                              onClick={() => selectFriend(friend)}
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
                              {friend}
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
                  Select albums or individual songs to re-sync lyrics or re-scan mentions.
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
                      : `Scan mentions (${selectedWithLyrics})`}
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
                                  {hasTrackLyrics && (
                                    <Link
                                      href={`/dev/annotate?song=${encodeURIComponent(song)}&album=${encodeURIComponent(album)}`}
                                      onClick={e => e.stopPropagation()}
                                      style={{
                                        fontSize: 10,
                                        color: '#3A3A3A',
                                        textDecoration: 'none',
                                        marginLeft: 4,
                                      }}
                                    >
                                      annotate
                                    </Link>
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
                {!selectedFriend && (
                  <div style={{ color: '#3A3A3A', fontStyle: 'italic' }}>
                    Select a friend from the sidebar or click a name in the Overview/Timeline tabs.
                  </div>
                )}
                {selectedFriend && results && results.mentions[selectedFriend] && (() => {
                  const ms = results.mentions[selectedFriend];
                  const sorted = [...ms].sort((a, b) => a.year - b.year || a.album.localeCompare(b.album));
                  const albums = [...new Set(ms.map(m => m.album))];
                  const years = ms.map(m => m.year);
                  const minYear = Math.min(...years);
                  const maxYear = Math.max(...years);

                  return (
                    <div>
                      <h2 style={{ color: '#C9A84C', fontSize: 28, fontFamily: 'Georgia, serif', marginBottom: 8 }}>
                        {selectedFriend}
                      </h2>
                      <div style={{ display: 'flex', gap: 20, marginBottom: 8, color: '#5A5A5A', fontSize: 12 }}>
                        <span><span style={{ color: '#C9A84C' }}>{ms.length}</span> mention{ms.length !== 1 ? 's' : ''}</span>
                        <span><span style={{ color: '#C9A84C' }}>{albums.length}</span> album{albums.length !== 1 ? 's' : ''}</span>
                        <span><span style={{ color: '#C9A84C' }}>{minYear === maxYear ? minYear : `${minYear}–${maxYear}`}</span></span>
                      </div>
                      <div style={{ color: '#5A5A5A', fontSize: 11, marginBottom: 32 }}>
                        {ms.filter(m => reviews[mentionKey(m)]).length} of {ms.length} reviewed
                      </div>

                      {sorted.map((mention, i) => (
                        <MentionReviewRow
                          key={mentionKey(mention)}
                          mention={mention}
                          review={reviews[mentionKey(mention)]}
                          onSave={payload => saveReview(mention, payload)}
                          editingKey={editingReviewKey}
                          setEditingKey={setEditingReviewKey}
                        />
                      ))}
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
