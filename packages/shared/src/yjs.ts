import * as Y from 'yjs';

/**
 * Build a Y.Doc for a given room. Callers wire this up to y-supabase (or a
 * Supabase Realtime channel) in the app layer, since the provider needs
 * environment-specific auth/session handling.
 */
export function createRoomDoc(roomId: string): Y.Doc {
  const doc = new Y.Doc();
  doc.gc = true;
  // Tag the doc so debugging tools can identify the room.
  (doc as unknown as { name: string }).name = `room:${roomId}`;
  return doc;
}

/** Deterministic-ish awareness color from a user id. */
export function colorForUser(userId: string): string {
  let h = 0;
  for (let i = 0; i < userId.length; i++) h = (h * 31 + userId.charCodeAt(i)) >>> 0;
  const hue = h % 360;
  return `hsl(${hue} 70% 55%)`;
}

/** Generate a short, human-friendly room code. */
export function generateRoomId(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = '';
  for (let i = 0; i < 8; i++) out += alphabet[Math.floor(Math.random() * alphabet.length)];
  return `${out.slice(0, 4)}-${out.slice(4)}`;
}
