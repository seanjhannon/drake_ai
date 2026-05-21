'use client';

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { DRAKE_DISCOGRAPHY, ALBUM_COLORS } from '@/lib/discography';
import { trackKey } from '@/lib/tracks';

interface Mention {
  friend: string;
  bar: string;
  song: string;
  album: string;
  year: number;
  mentionKey: string;
}

interface TrackData {
  song: string;
  album: string;
  year: number;
  lyrics: string;
  lines: string[];
}

function lineIsTagged(line: string, mentions: Mention[]): boolean {
  const lower = line.toLowerCase();
  return mentions.some(
    m => m.bar === line || m.bar.toLowerCase() === lower || lower.includes(m.bar.toLowerCase()),
  );
}

function AnnotatePageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [trackLyrics, setTrackLyrics] = useState<Record<string, boolean>>({});
  const [mentionCounts, setMentionCounts] = useState<Record<string, number>>({});
  const [track, setTrack] = useState<TrackData | null>(null);
  const [mentions, setMentions] = useState<Mention[]>([]);
  const [selectedBar, setSelectedBar] = useState<string | null>(null);
  const [friendInput, setFriendInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const selectedSong = searchParams.get('song');
  const selectedAlbum = searchParams.get('album');

  useEffect(() => {
    fetch('/api/lyrics')
      .then(r => r.json())
      .then(data => {
        if (data.data?.trackLyrics) setTrackLyrics(data.data.trackLyrics);
      })
      .catch(() => {});
    fetch('/api/results')
      .then(r => r.json())
      .then(data => {
        if (!data.data?.mentions) return;
        const counts: Record<string, number> = {};
        for (const list of Object.values(data.data.mentions) as Mention[][]) {
          for (const m of list) {
            const k = trackKey(m.song, m.album);
            counts[k] = (counts[k] ?? 0) + 1;
          }
        }
        setMentionCounts(counts);
      })
      .catch(() => {});
  }, []);

  const loadMentions = useCallback(async (song: string, album: string) => {
    const res = await fetch(
      `/api/mentions/track?song=${encodeURIComponent(song)}&album=${encodeURIComponent(album)}`,
    );
    const data = await res.json();
    setMentions(data.mentions ?? []);
  }, []);

  const selectTrack = useCallback(
    (song: string, album: string) => {
      const params = new URLSearchParams();
      params.set('song', song);
      params.set('album', album);
      router.replace(`/dev/annotate?${params.toString()}`, { scroll: false });
    },
    [router],
  );

  useEffect(() => {
    if (!selectedSong || !selectedAlbum) {
      setTrack(null);
      setMentions([]);
      setSelectedBar(null);
      return;
    }

    setLoading(true);
    setError(null);
    setStatus(null);

    Promise.all([
      fetch(
        `/api/lyrics/track?song=${encodeURIComponent(selectedSong)}&album=${encodeURIComponent(selectedAlbum)}`,
      ).then(r => {
        if (!r.ok) throw new Error(r.status === 404 ? 'No lyrics for this track' : 'Failed to load lyrics');
        return r.json();
      }),
      loadMentions(selectedSong, selectedAlbum),
    ])
      .then(([trackData]) => {
        setTrack(trackData as TrackData);
        setSelectedBar(null);
      })
      .catch((e: Error) => {
        setTrack(null);
        setError(e.message);
      })
      .finally(() => setLoading(false));
  }, [selectedSong, selectedAlbum, loadMentions]);

  const addMention = async () => {
    if (!track || !selectedBar || !friendInput.trim()) return;
    setSubmitting(true);
    setError(null);
    setStatus(null);
    try {
      const res = await fetch('/api/mentions/manual', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          friend: friendInput.trim(),
          bar: selectedBar,
          song: track.song,
          album: track.album,
          year: track.year,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (res.status === 409) setError('Mention already exists');
        else setError(data.error ?? 'Failed to add mention');
        return;
      }
      setFriendInput('');
      setStatus(`Added ${data.mention.friend}`);
      await loadMentions(track.song, track.album);
      const k = trackKey(track.song, track.album);
      setMentionCounts(prev => ({ ...prev, [k]: (prev[k] ?? 0) + 1 }));
    } catch {
      setError('Failed to add mention');
    } finally {
      setSubmitting(false);
    }
  };

  const activeKey =
    selectedSong && selectedAlbum ? trackKey(selectedSong, selectedAlbum) : null;

  const pickerStyle = useMemo(
    () => ({
      width: 220,
      flexShrink: 0,
      borderRight: '1px solid #2A2A2A',
      overflowY: 'auto' as const,
      padding: '8px 0',
    }),
    [],
  );

  return (
    <div style={{ display: 'flex', height: 'calc(100vh - 41px)' }}>
      <aside style={pickerStyle}>
        {DRAKE_DISCOGRAPHY.map(({ album, songs }) => {
          const color = ALBUM_COLORS[album] || '#5A5A5A';
          return (
            <div key={album} style={{ marginBottom: 8 }}>
              <div
                style={{
                  padding: '4px 12px',
                  color,
                  fontSize: 10,
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                }}
              >
                {album}
              </div>
              {songs.map(song => {
                const key = trackKey(song, album);
                const hasLyrics = trackLyrics[key];
                const count = mentionCounts[key] ?? 0;
                const active = activeKey === key;
                return (
                  <button
                    key={key}
                    type="button"
                    disabled={!hasLyrics}
                    onClick={() => hasLyrics && selectTrack(song, album)}
                    style={{
                      display: 'block',
                      width: '100%',
                      textAlign: 'left',
                      padding: '3px 12px',
                      border: 'none',
                      background: active ? '#1A1A1A' : 'transparent',
                      color: !hasLyrics ? '#3A3A3A' : active ? '#C9A84C' : '#8A7A5A',
                      cursor: hasLyrics ? 'pointer' : 'default',
                      fontSize: 11,
                      fontFamily: 'inherit',
                    }}
                  >
                    {song}
                    {!hasLyrics && (
                      <span style={{ color: '#3A3A3A', marginLeft: 4 }}>(no lyrics)</span>
                    )}
                    {hasLyrics && count > 0 && (
                      <span style={{ color: '#5A5A5A', marginLeft: 4 }}>{count}</span>
                    )}
                  </button>
                );
              })}
            </div>
          );
        })}
      </aside>

      <main
        style={{
          flex: 1,
          minWidth: 0,
          overflowY: 'auto',
          padding: '12px 16px',
          borderRight: '1px solid #2A2A2A',
        }}
      >
        {!selectedSong && (
          <div style={{ color: '#3A3A3A', paddingTop: 24 }}>Select a song with lyrics</div>
        )}
        {loading && <div style={{ color: '#5A5A5A' }}>Loading…</div>}
        {error && !loading && <div style={{ color: '#cc4444' }}>{error}</div>}
        {track && !loading && (
          <>
            <div style={{ marginBottom: 12, color: '#5A5A5A' }}>
              {track.song} · {track.album} · {track.year}
            </div>
            {track.lines.map((line, i) => {
              const tagged = lineIsTagged(line, mentions);
              const selected = selectedBar === line;
              return (
                <button
                  key={i}
                  type="button"
                  onClick={() => setSelectedBar(line)}
                  style={{
                    display: 'block',
                    width: '100%',
                    textAlign: 'left',
                    padding: '4px 8px',
                    marginBottom: 2,
                    border: 'none',
                    borderLeft: selected
                      ? '2px solid #C9A84C'
                      : tagged
                        ? '2px solid #3A5A3A'
                        : '2px solid transparent',
                    background: selected ? '#1A1A1A' : tagged ? '#101410' : 'transparent',
                    color: tagged ? '#8A9A8A' : '#E8D5A3',
                    cursor: 'pointer',
                    fontSize: 12,
                    lineHeight: 1.5,
                    fontFamily: 'inherit',
                  }}
                >
                  {line}
                </button>
              );
            })}
          </>
        )}
      </main>

      <aside
        style={{
          width: 280,
          flexShrink: 0,
          padding: 12,
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
          overflowY: 'auto',
        }}
      >
        <div style={{ color: '#5A5A5A', fontSize: 10, letterSpacing: '0.08em' }}>ADD MENTION</div>
        {selectedBar ? (
          <div
            style={{
              color: '#E8D5A3',
              fontSize: 11,
              lineHeight: 1.5,
              padding: 8,
              background: '#141414',
              border: '1px solid #2A2A2A',
            }}
          >
            &ldquo;{selectedBar}&rdquo;
          </div>
        ) : (
          <div style={{ color: '#3A3A3A', fontSize: 11 }}>Click a lyric line</div>
        )}
        <input
          value={friendInput}
          onChange={e => setFriendInput(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter') addMention();
          }}
          placeholder="Friend name"
          disabled={!selectedBar || submitting}
          style={{
            background: '#141414',
            border: '1px solid #2A2A2A',
            color: '#E8D5A3',
            padding: '8px 10px',
            fontSize: 12,
            fontFamily: 'inherit',
          }}
        />
        <button
          type="button"
          disabled={!selectedBar || !friendInput.trim() || submitting}
          onClick={addMention}
          style={{
            background: !selectedBar || !friendInput.trim() ? '#1A1A1A' : '#C9A84C',
            color: !selectedBar || !friendInput.trim() ? '#5A5A5A' : '#0A0A0A',
            border: 'none',
            padding: '8px 12px',
            fontSize: 11,
            cursor: !selectedBar || !friendInput.trim() ? 'not-allowed' : 'pointer',
            fontFamily: 'inherit',
            letterSpacing: '0.05em',
          }}
        >
          {submitting ? 'Adding…' : 'Add mention'}
        </button>
        {status && <div style={{ color: '#6A8A6A', fontSize: 11 }}>{status}</div>}

        <div style={{ color: '#5A5A5A', fontSize: 10, letterSpacing: '0.08em', marginTop: 8 }}>
          ON THIS TRACK ({mentions.length})
        </div>
        {mentions.length === 0 && (
          <div style={{ color: '#3A3A3A', fontSize: 11 }}>No mentions yet</div>
        )}
        {mentions.map(m => (
          <div
            key={m.mentionKey}
            style={{
              padding: 8,
              borderLeft: '2px solid #3A5A3A',
              background: '#101410',
            }}
          >
            <div style={{ color: '#C9A84C', marginBottom: 4 }}>{m.friend}</div>
            <div style={{ color: '#8A7A5A', fontSize: 11, lineHeight: 1.4 }}>&ldquo;{m.bar}&rdquo;</div>
          </div>
        ))}
      </aside>
    </div>
  );
}

export default function AnnotatePage() {
  return (
    <Suspense fallback={<div style={{ padding: 16, color: '#5A5A5A' }}>Loading…</div>}>
      <AnnotatePageInner />
    </Suspense>
  );
}
