# Phase 3 — Next.js collaborative editor

## What this phase gives you

- Supabase Auth with magic-link email flow (`/login`, `/auth/callback`).
- Auth-guarded routes via `middleware.ts` (`/dashboard`, `/scripts/*`).
- Dashboard with create/delete/list scripts backed by Server Actions.
- Tiptap editor with **Yjs** collaborative state and awareness cursors.
- Real-time sync via `SupabaseYjsProvider` (see `packages/shared/src/yjs-provider.ts`) — broadcast for live updates + debounced Postgres snapshot writes for durability.

## Files

```
web/
├── package.json / tsconfig.json / next.config.mjs / tailwind.config.ts
├── middleware.ts                      # session refresh + route guards
├── app/
│   ├── layout.tsx / globals.css / page.tsx
│   ├── login/{page,actions}.tsx       # magic-link auth
│   ├── auth/callback/route.ts         # code-for-session exchange
│   ├── auth/signout/route.ts
│   ├── dashboard/{page,actions}.tsx   # list / create / delete
│   └── scripts/[id]/
│       ├── page.tsx                   # server component, fetches script row
│       └── EditorClient.tsx           # Tiptap + Yjs + Supabase provider
├── components/
│   ├── EditorToolbar.tsx              # bold/italic/H1-H3/lists/quote/code
│   └── RoomBadge.tsx                  # copyable room code
└── lib/supabase/
    ├── browser.ts                     # createBrowserClient
    ├── server.ts                      # createServerClient (cookies)
    └── middleware.ts                  # session refresh helper
```

## Running

```bash
cd web
npm install
npm run dev
# open http://localhost:3000 → sign in → create a script → start typing
```

## How real-time works

```
User A types                                    User B (or Tauri reader)
    ↓                                                       ↑
Tiptap → Y.Doc.update ─────────────────────── Y.Doc.applyUpdate
    ↓                                                       ↑
SupabaseYjsProvider                              SupabaseYjsProvider
    ↓                                                       ↑
    └───── Supabase Realtime  broadcast (room:XXXX) ────────┘
                          |
             debounced 2s: encodeStateAsUpdate → scripts.y_state
```

Late joiners fetch `scripts.y_state`, apply it, then subscribe to the broadcast channel. New updates from any peer are merged via Yjs CRDT semantics — no server-side conflict resolution needed.

## Awareness cursors

`CollaborationCursor` renders remote carets with the collaborator's name + color. Local awareness state (name/color/user_id) is set at editor mount; remote awareness rides the same broadcast channel as document updates and is merged into `y-protocols` Awareness so Tiptap can display it.

## Row-Level Security

All queries hit RLS-protected tables:

- Dashboard `select` — returns only scripts you own or are a collaborator on.
- `insert` — always sets `owner_id = auth.uid()` (enforced by RLS).
- `update` (Yjs snapshot writes) — allowed for owner + editor collaborators.
- `delete` — owner only.

The `y_state` bytea column is only writable by editors, so a viewer-role user cannot corrupt shared state even if they open the editor URL directly.
