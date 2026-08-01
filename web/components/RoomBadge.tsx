'use client';

import { useState } from 'react';

export default function RoomBadge({ roomId }: { roomId: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(roomId);
          setCopied(true);
          setTimeout(() => setCopied(false), 1200);
        } catch { /* ignore */ }
      }}
      className="text-xs font-mono px-2 py-1 rounded-full bg-white/5 border border-white/10 hover:bg-white/10"
      title="Click to copy — enter this in the desktop app to open the same script"
    >
      {copied ? 'Copied!' : `Room ${roomId}`}
    </button>
  );
}
