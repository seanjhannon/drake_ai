import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Drake Friend Tracker',
  description: 'OVO Intelligence — Every real-world figure Drake has ever mentioned',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
