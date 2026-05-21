import Link from 'next/link';

export default function DevLayout({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
        fontSize: 12,
        background: '#0A0A0A',
        color: '#E8D5A3',
      }}
    >
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 16,
          padding: '10px 16px',
          borderBottom: '1px solid #2A2A2A',
          flexShrink: 0,
        }}
      >
        <span style={{ color: '#C9A84C', letterSpacing: '0.05em' }}>dev / annotate</span>
        <Link
          href="/"
          style={{ color: '#5A5A5A', textDecoration: 'none', fontSize: 11 }}
        >
          ← Drake Friend Tracker
        </Link>
      </header>
      <div style={{ flex: 1, minHeight: 0 }}>{children}</div>
    </div>
  );
}
