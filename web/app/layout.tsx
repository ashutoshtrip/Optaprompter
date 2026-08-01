import './globals.css';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'OptaPrompter',
  description: 'Real-time collaborative teleprompter',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-surface text-gray-200 antialiased">
        {children}
      </body>
    </html>
  );
}
