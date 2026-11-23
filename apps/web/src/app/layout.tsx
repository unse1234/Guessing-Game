import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import './globals.css';
import './lobby.css';

export const metadata: Metadata = {
  title: 'Draw & Guess',
  description: 'A real-time drawing and guessing game for friends.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body>{children}</body>
    </html>
  );
}
