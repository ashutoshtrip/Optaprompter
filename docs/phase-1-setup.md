# Phase 1 — Setup

## 1. Create the Supabase project

1. Go to https://supabase.com → New project.
2. Copy the **Project URL** and **anon public key**.
3. Open the SQL editor and run [`supabase/migrations/0001_init.sql`](../supabase/migrations/0001_init.sql) verbatim.
4. In **Authentication → Providers**, enable Email (and Magic Link if desired).
5. In **Authentication → URL Configuration**, add `http://localhost:3000` as an allowed redirect for local dev.

## 2. Env

```bash
cp .env.example .env.local
```

Set both `NEXT_PUBLIC_SUPABASE_*` (for the Next.js app) and `VITE_SUPABASE_*` (for the Tauri renderer). They point at the same project.

## 3. Install dependencies

```bash
npm install
```

`npm workspaces` links `@optaprompter/shared` into both `web/` and `desktop/` automatically.

## 4. Verify

```bash
npm run dev:web
# → visit http://localhost:3000, sign in, create a script → row appears in Supabase
```

Phase 2 wires the Tauri window; Phase 3 wires the collaborative editor; Phase 4 wires the reader UI + realtime sync.
