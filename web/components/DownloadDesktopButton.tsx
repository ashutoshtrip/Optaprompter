'use client';

import { useEffect, useState } from 'react';

interface Props {
  className?: string;
  variant?: 'primary' | 'ghost';
  label?: string;
}

/**
 * Renders a "Download desktop app" link.
 *
 * The URL comes from `NEXT_PUBLIC_DESKTOP_DOWNLOAD_URL` (set in Vercel).
 * If unset, falls back to the repo's GitHub releases page. When the user is
 * on macOS we say "Download for Mac"; otherwise generic label.
 */
export default function DownloadDesktopButton({
  className = '',
  variant = 'primary',
  label,
}: Props) {
  const href =
    process.env.NEXT_PUBLIC_DESKTOP_DOWNLOAD_URL ||
    'https://github.com/ashutoshtrip/Optaprompter/releases/latest';

  const [platform, setPlatform] = useState<'mac' | 'other' | 'unknown'>('unknown');
  useEffect(() => {
    const ua = navigator.userAgent.toLowerCase();
    if (ua.includes('mac')) setPlatform('mac');
    else setPlatform('other');
  }, []);

  const text =
    label ??
    (platform === 'mac'
      ? 'Download for Mac (Apple Silicon)'
      : 'Download desktop app');

  const base =
    'inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition';
  const styles =
    variant === 'primary'
      ? 'bg-white text-black hover:bg-gray-200'
      : 'text-gray-300 hover:text-white border border-white/10 hover:bg-white/5';

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={`${base} ${styles} ${className}`}
      title="Opens the release page in a new tab"
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M12 3v12" />
        <path d="M7 10l5 5 5-5" />
        <path d="M5 21h14" />
      </svg>
      {text}
    </a>
  );
}
