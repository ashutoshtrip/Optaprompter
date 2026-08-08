# OptaPrompter

A real-time collaborative teleprompter. Your team edits the script live in a browser (Google-Docs style); the presenter reads it from a desktop overlay that is **invisible to Zoom, Meet, and Teams screen share** while still visible on the presenter's own monitor.

- `web/` — Next.js editor (Tiptap + Yjs)
- `desktop/` — Tauri v2 transparent overlay reader (macOS)
- `packages/shared/` — shared `SupabaseYjsProvider` (Realtime broadcast + Postgres snapshot)
- `supabase/migrations/` — Postgres schema (profiles, scripts, RLS)

---

## Table of contents

- [Architecture](#architecture)
  - [Component map](#component-map)
  - [Tech stack](#tech-stack)
  - [Repo layout](#repo-layout)
  - [Data model](#data-model)
  - [Real-time sync](#real-time-sync-the-supabaseyjsprovider)
  - [Auth flow](#auth-flow)
  - [Desktop overlay internals](#desktop-overlay-internals)
  - [Global hotkeys](#global-hotkeys)
- [Getting started](#getting-started)
  - [Prerequisites](#1-prerequisites)
  - [Supabase setup](#2-set-up-supabase-5-minutes)
  - [Environment](#3-configure-environment)
  - [Install](#4-install-dependencies)
  - [Run web + desktop](#5-run-the-web-app)
- [Testing the flow](#7-test-the-application)
- [Deployment](#deployment)
- [Roadmap and known limits](#where-scale-would-first-bite)
- [Troubleshooting](#troubleshooting)

---

# Architecture

## Component map

```
                          ┌────────────────────────────────────┐
                          │           Supabase (cloud)         │
                          │                                    │
                          │  ┌──────────────┐  ┌─────────────┐ │
                          │  │  Auth (OTP)  │  │  Postgres   │ │
                          │  │   Mailjet    │  │  scripts /  │ │
                          │  │   SMTP       │  │  profiles / │ │
                          │  └──────────────┘  │  collabs    │ │
                          │                    └─────────────┘ │
                          │  ┌────────────────────────────────┐│
                          │  │  Realtime (WebSocket)          ││
                          │  │  broadcast channel: room:XXXX  ││
                          │  └────────────────────────────────┘│
                          └──▲───────────────────────▲─────────┘
                    REST+WS  │                       │  REST+WS
        ┌────────────────────┴───────────┐  ┌────────┴──────────────────────────┐
        │  Web app (Next.js on Vercel)   │  │  Desktop app (Tauri v2, macOS)    │
        │                                │  │                                   │
        │  ┌──────────────────────────┐  │  │  ┌─────────────────────────────┐  │
        │  │ Tiptap editor + Y.Doc    │  │  │  │ Tiptap read-only + Y.Doc    │  │
        │  │  - CollaborationCursor   │  │  │  │  - auto-scroll rAF loop     │  │
        │  │  - Image (paste/drop)    │  │  │  │  - inline image render      │  │
        │  └──────────────────────────┘  │  │  └─────────────────────────────┘  │
        │            │                   │  │            │                      │
        │  ┌─────────▼──────────────┐    │  │  ┌─────────▼──────────────┐       │
        │  │ SupabaseYjsProvider    │    │  │  │ SupabaseYjsProvider    │       │
        │  │  writable: true        │    │  │  │  writable: false       │       │
        │  └────────────────────────┘    │  │  └────────────────────────┘       │
        │                                │  │                                   │
        │  Auth (@supabase/ssr)          │  │  Rust backend:                    │
        │  Dashboard / CRUD              │  │   • NSPanel class swap            │
        │  Room-code sharing UI          │  │   • NSApp = Accessory (reader)    │
        │  Download-app button           │  │   • contentProtected              │
        │                                │  │   • global hotkeys                │
        └────────────────────────────────┘  │   • click-through toggle          │
                                            └───────────────────────────────────┘
```

Shared code lives in `packages/shared/` (npm workspace).

---

## Tech stack

| Concern             | Choice                                         | Why                                                                                       |
| ------------------- | ---------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Web framework       | **Next.js 15 (App Router)** on **Vercel**      | Server Actions for auth, RSC for dashboards, one-click deploys.                           |
| Desktop shell       | **Tauri v2** (Rust + WebView)                  | ~10× smaller than Electron, direct native window APIs for the invisibility trick.         |
| Editor              | **Tiptap** (Headless ProseMirror)              | Same extension set + schema on web and desktop.                                           |
| CRDT sync           | **Yjs** + custom `SupabaseYjsProvider`         | Conflict-free multi-user edits without a dedicated Yjs server.                            |
| Realtime transport  | **Supabase Realtime** broadcast channels       | Managed WebSockets, per-room channels.                                                    |
| Durable snapshot    | Postgres `scripts.y_state` **text** (base64)   | Late joiners bootstrap without replaying history.                                         |
| Auth                | **Supabase Auth**, email OTP                   | Passwordless. Same account across web + desktop.                                          |
| SMTP                | **Mailjet**                                    | Free 200/day; sends to any recipient without domain (unlike Resend sandbox).              |
| Database            | **Postgres** (managed by Supabase) + **RLS**   | Anon key can be shipped in every client because rows are gated by RLS.                    |
| Distribution        | Vercel (web) + GitHub Releases (desktop `.dmg`)| Zero cost, minimal setup.                                                                 |

---

## Repo layout

```
OptaPrompter/
├── web/                        Next.js 15, app router
│   ├── app/
│   │   ├── page.tsx                    landing
│   │   ├── login/{page,actions}.tsx    magic-link auth
│   │   ├── auth/{callback,signout}     browser OAuth callbacks
│   │   ├── dashboard/{page,actions}    list / create / delete scripts
│   │   └── scripts/[id]/…              Tiptap collab editor
│   ├── components/                     DownloadDesktopButton, EditorToolbar, RoomBadge
│   ├── lib/supabase/{browser,server,middleware}.ts
│   ├── middleware.ts                   session refresh + route guards
│   ├── vercel.json                     monorepo build hooks
│   └── next.config.mjs
│
├── desktop/                    Tauri v2 + React (Vite)
│   ├── src/
│   │   ├── App.tsx             view state machine (auth → picker → reader)
│   │   ├── components/         AuthGate, RoomPicker, Reader, OverlayControls
│   │   └── lib/supabase.ts     browser-style client with local session storage
│   └── src-tauri/
│       ├── src/
│       │   ├── lib.rs                  commands, hotkeys, setup
│       │   └── window_protection.rs    NSPanel + Accessory + contentProtected
│       ├── tauri.conf.json             1200×520, transparent, always-on-top
│       ├── capabilities/default.json   IPC + shortcut permissions
│       └── icons/                      checked-in PNG/ICNS/ICO
│
├── packages/shared/            @optaprompter/shared workspace
│   └── src/
│       ├── yjs.ts                      colorForUser, generateRoomId
│       └── yjs-provider.ts             SupabaseYjsProvider (sync engine)
│
├── supabase/migrations/
│   ├── 0001_init.sql                   tables + RLS + handle_new_user trigger
│   ├── 0002_fix_rls_recursion.sql      SECURITY DEFINER helper funcs
│   ├── 0003_y_state_text.sql           bytea → text base64
│   └── 0004_share_by_room_code.sql     open RLS + ownership-immutability trigger
│
├── docs/                       per-phase design notes
├── DEPLOY.md                   Vercel + GitHub Releases guide
├── README.md                   this file
└── .npmrc                      project-local public registry override
```

---

## Data model

Three tables in `public`:

```sql
profiles                     -- 1:1 with auth.users, populated by trigger
  id           uuid PK  → auth.users.id
  email        text
  display_name text
  created_at   timestamptz

scripts                      -- one document per session
  id           uuid PK
  title        text
  room_id      text UNIQUE   -- 8-char human code, the "share link secret"
  owner_id     uuid FK → profiles.id
  y_state      text          -- base64 of Y.encodeStateAsUpdate(doc)
  created_at   timestamptz
  updated_at   timestamptz

script_collaborators         -- reserved for future explicit sharing
  script_id, user_id, role   -- currently unused; RLS is room-code based
```

### Row-Level Security

**SELECT/UPDATE:** any authenticated user (`auth.uid() IS NOT NULL`). Access gate is knowing the `room_id`. Same model as Google Docs "anyone with link."

**Ownership immutability:** a `BEFORE UPDATE` trigger reverts `owner_id`, `room_id`, `title`, `created_at` for non-owners. Non-owners can only edit `y_state` and `updated_at`.

**INSERT/DELETE:** owner-only.

**Cross-table recursion fix (migration 0002):** the initial policy set had `scripts` policy reading `script_collaborators` and vice-versa → Postgres infinite recursion. Fixed with `SECURITY DEFINER` helper functions (`is_script_collaborator`, `is_script_editor`, `is_script_owner`) that bypass RLS internally.

---

## Real-time sync — the `SupabaseYjsProvider`

Custom provider (~180 LoC) in `packages/shared/src/yjs-provider.ts`. Two independent channels:

### Broadcast (transient, <100 ms)

- Every local `Y.Doc` update is base64-encoded and sent on the `room:{roomId}` Supabase Realtime channel.
- Peers receive it → `Y.applyUpdate(doc, bytes, 'supabase-remote')`. CRDT merge is idempotent so out-of-order delivery is fine.
- **Sync handshake on subscribe:** peer sends `sync-request` + its current full state as `sync-response`; other peers reply with theirs. Fixes the "late joiner sees empty doc while typing continues" race.

### Snapshot (durable, debounced 2s)

- Editor (writable) flushes `Y.encodeStateAsUpdate(doc)` base64 → `scripts.y_state`.
- Desktop reader on mount fetches this and applies it before joining the broadcast channel.
- Handles the case where the presenter opens the overlay well after the last editor session ended.

### Awareness (cursors)

- `y-protocols` `Awareness` instance per editor mount.
- Local state: `{ name, color, userId }`.
- Rides the same broadcast channel via a `kind: 'awareness'` message.
- Remote awareness merged into local `Awareness` through a `CustomEvent` bridge so Tiptap's `CollaborationCursor` renders it natively.

---

## Auth flow

Web and desktop share the same Supabase project + accounts. Different session-storage strategies per client.

```
Web:
  user enters email → server action → signInWithOtp(email, redirectTo: /auth/callback)
  → magic link email → user clicks link → /auth/callback exchanges code
  → cookie-based session (SSR-safe) → dashboard

Desktop:
  user enters email → supabase.auth.signInWithOtp({ shouldCreateUser: true })
  → email delivered with {{ .Token }} 6-digit code
  → user pastes code → supabase.auth.verifyOtp({ email, token, type: 'email' })
  → session persisted to localStorage under key 'optaprompter.desktop.auth'

Sharing:
  RLS is open to any auth user → room_id is the secret →
  Alice creates script, sends code to Bob → Bob signs in with HIS email in the desktop,
  pastes the room code → both editing the same Y.Doc.
```

Defensive extras: `signOut` on `AuthGate` mount + email-mismatch guard after `verifyOtp` so we never silently sign in as a previously-cached user.

---

## Desktop overlay internals

The core value prop (invisible to screen share, floats over fullscreen apps, doesn't steal focus) required layered macOS-specific work in `desktop/src-tauri/src/window_protection.rs`:

```
Baseline (applied at startup, always on):
  ✓ alwaysOnTop, visibleOnAllWorkspaces
  ✓ contentProtected  →  NSWindowSharingTypeNone (macOS)
                         WDA_EXCLUDEFROMCAPTURE (Windows)

Overlay mode (applied only while Reader view is mounted):
  ✓ NSApp.activationPolicy = Accessory        (no Dock, no Cmd+Tab)
  ✓ object_setClass NSWindow → NSPanel        (one-way runtime class swap)
  ✓ styleMask |= NonactivatingPanel
  ✓ level = NSPopUpMenuWindowLevel (101)
  ✓ collectionBehavior = canJoinAllSpaces | fullScreenAuxiliary
                          | stationary | ignoresCycle | transient
  ✓ setBecomesKeyOnlyIfNeeded: true
  ✓ setFloatingPanel: true
  ✓ orderFrontRegardless

Leave overlay mode (going back to auth/picker):
  ✓ styleMask &= ~NonactivatingPanel
  ✓ level = 0
  ✓ activationPolicy = Regular
  ✓ makeKeyAndOrderFront
```

**Why the split**: the aggressive overlay mode blocks keyboard input (nonactivating panels don't become key windows). Auth + picker screens need typing, so they run in **baseline mode only**. Only the read-only reader triggers full overlay hardening — via `invoke('enter_overlay_mode')` on `useEffect` mount, reversed on unmount.

---

## Global hotkeys

Registered at startup via `tauri-plugin-global-shortcut`. Both `Cmd+Shift+…` (macOS) and `Ctrl+Shift+…` (Win/Linux) variants of the same physical shortcut.

| Shortcut                        | Action                                                       |
| ------------------------------- | ------------------------------------------------------------ |
| `⌘/⌃ + Shift + P`               | Toggle click-through (mouse events pass to app behind)       |
| `⌘/⌃ + Shift + T`               | Hide/show toolbar                                            |
| `⌘/⌃ + Shift + Space`           | Play/pause auto-scroll                                       |
| `⌘/⌃ + Shift + ↑` / `↓`         | Speed −10 / +10 px/sec                                       |
| `⌘/⌃ + Shift + =` / `-`         | Font size +2 / −2 px                                         |
| `⌘/⌃ + Shift + R`               | Reset session timer                                          |
| `⌘/⌃ + Shift + Q`               | Quit app                                                     |

All work from anywhere — even when PowerPoint has focus. Rust owns the source of truth (click-through state) and emits events; React state mirrors so hotkey fires with unfocused overlay never drift.

---

# Getting started

## 1. Prerequisites

Install once per machine:

| Tool          | Version | Install                                                                     |
| ------------- | ------- | --------------------------------------------------------------------------- |
| **Node.js**   | ≥ 20    | https://nodejs.org or `nvm install 20`                                     |
| **Rust**      | stable  | `curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs \| sh`           |
| **Tauri deps**| —       | See platform-specific below                                                 |
| **Supabase**  | free    | Create an account at https://supabase.com                                   |

**macOS Tauri deps:** `xcode-select --install`

**Windows Tauri deps:** [Microsoft C++ Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/) + [WebView2](https://developer.microsoft.com/en-us/microsoft-edge/webview2/) (usually pre-installed).

**Linux Tauri deps:**
```bash
sudo apt install -y libwebkit2gtk-4.1-dev libssl-dev libayatana-appindicator3-dev librsvg2-dev build-essential curl wget file
```

Confirm:
```bash
node -v      # v20+
cargo -V     # cargo 1.75+
```

---

## 2. Set up Supabase (5 minutes)

1. https://supabase.com → **New project**. Pick any region; free tier is enough.
2. Once provisioned, in the sidebar go to **SQL Editor → New query** and run **all four** migrations in order:
   - `supabase/migrations/0001_init.sql`
   - `supabase/migrations/0002_fix_rls_recursion.sql`
   - `supabase/migrations/0003_y_state_text.sql`
   - `supabase/migrations/0004_share_by_room_code.sql`
3. **Authentication → Providers → Email** — leave enabled. For local dev, turn **off** "Confirm email".
4. **Authentication → Emails → Magic Link** template — replace the body with:
   ```html
   <h2>Sign in to OptaPrompter</h2>
   <p>Your 6-digit sign-in code:</p>
   <p style="font-size:32px;letter-spacing:6px;font-weight:bold;font-family:monospace">{{ .Token }}</p>
   <p style="color:#666;font-size:13px">Or click: <a href="{{ .ConfirmationURL }}">Sign in link</a></p>
   ```
   Do the same for the **Confirm signup** template if you keep email confirmation on.
5. **Authentication → URL Configuration → Redirect URLs** — add:
   - `http://localhost:3000/**`
   - `http://localhost:3000/auth/callback`
   - (Later) your Vercel URL.
6. **Authentication → SMTP Settings** — enable **Custom SMTP** and plug in Mailjet creds (see [SMTP setup](#smtp-setup-mailjet)).
7. **Project Settings → API** — copy the **Project URL** and **anon public** key. You'll paste them next.

---

## 3. Configure environment

From the repo root:

```bash
cp .env.example .env.local
```

Fill in all four values (`NEXT_PUBLIC_*` for Next.js, `VITE_*` for Tauri renderer — same Supabase project):

```env
NEXT_PUBLIC_SUPABASE_URL=https://YOUR-PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGci...
VITE_SUPABASE_URL=https://YOUR-PROJECT.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGci...
```

Both the web and desktop app read env vars from **their own** `.env.local`. Copy:

```bash
cp .env.local web/.env.local
cp .env.local desktop/.env.local
```

> Don't `ln -s` — Vite and Next.js don't always resolve symlinked `.env` files reliably. Use real copies. Re-copy if you change the root file. Dev servers only read env at **startup**; restart after edits.

---

## 4. Install dependencies

```bash
npm install
```

Installs all three workspaces (`web`, `desktop`, `packages/shared`) in one go. First run takes 1-2 minutes.

If your global `~/.npmrc` points at a private registry with an expired token (New Relic Artifactory etc.), the committed project-local `.npmrc` at the repo root overrides it to public npm without touching your global config.

---

## 5. Run the web app

```bash
npm run dev:web
```

Open http://localhost:3000. Sign up (magic-link OTP code from email), create a script.

---

## 6. Run the desktop app

In a second terminal:

```bash
npm run dev:desktop
```

First Rust compile takes ~2 minutes. A small transparent, borderless window appears floating on top of your other apps. Sign in with the same email OR a different email + join by room code.

---

## 7. Test the application

### 7a. Real-time sync
1. Web: create a "Test script", note the room code (top-right badge).
2. Type a few paragraphs.
3. Desktop: pick "Test script" (or paste room code).
4. Type more in the web → desktop overlay updates within ~100 ms.

Status pill top-right of the reader: `connecting → synced`.

### 7b. Screen-share invisibility
1. Start a Zoom, Meet, or Teams call (join a personal room in a second browser to test yourself).
2. Share **entire screen**.
3. Receiver sees your desktop but **not** the OptaPrompter overlay.
4. Your own monitor still shows the overlay.

Toggle **Hidden / Visible** in the toolbar to confirm both directions work.

> macOS + Windows only. Linux (Wayland/X11) has no equivalent OS API — the overlay will appear in shared screens.

### 7c. Click-through
1. Open PowerPoint / Keynote / any fullscreen app behind the overlay.
2. `Cmd/Ctrl + Shift + P` — indicator dot flips green.
3. Click anywhere in the overlay — click passes through to the app behind.
4. Same hotkey again to regain interaction.

### 7d. Auto-scroll and other controls
- `Space` — play/pause
- `↑/↓` — speed ±10 px/sec
- `+/-` — font size ±2 px
- `R` — reset timer

Or drag the sliders in the toolbar. In-window versions of these keys work whenever the overlay is focused; global versions (prefixed `Cmd/Ctrl+Shift+…`) work anywhere.

### 7e. Two-user collaboration (different accounts)
1. Alice signs in on the web app, creates a script, copies the room code.
2. Bob signs in on the desktop app with **his own email**, pastes the room code.
3. Both see and edit the same Y.Doc. Cursors appear with color-coded labels on the web editor.

### 7f. Image insertion
- Click the **🖼 Image** toolbar button → paste a URL or `data:image/...` base64.
- Or **paste** a screenshot directly (`Cmd + Ctrl + Shift + 4` on macOS → `Cmd + V` in the editor).
- Or **drag-and-drop** image files from Finder.

---

# Deployment

## Web (Vercel)

1. Push to GitHub. Ensure `.env.local` is either untracked or the repo is private.
2. Vercel → **New Project → Import Git Repository** → pick this repo.
3. **Root Directory:** set to `web`. `vercel.json` handles workspace install.
4. **Environment Variables:** add
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - (optional) `NEXT_PUBLIC_DESKTOP_DOWNLOAD_URL` — the GitHub Releases URL for the `.dmg`
5. **Deploy.**
6. Copy the resulting `*.vercel.app` URL, add it to Supabase → **Auth → URL Configuration → Redirect URLs**.

## Desktop (`.dmg` for macOS Apple Silicon)

Build:
```bash
npm run build:desktop
```
Output:
```
desktop/src-tauri/target/release/bundle/dmg/OptaPrompter_0.1.0_aarch64.dmg
```

Attach to a new GitHub Release (`v0.1.0`). See [DEPLOY.md](DEPLOY.md) for the full flow including release notes template.

**Version bump before rebuilds:** update `desktop/package.json`, `desktop/src-tauri/tauri.conf.json`, and `desktop/src-tauri/Cargo.toml` — all to the same version.

**Unsigned binary:** users get "damaged and can't be opened" from Gatekeeper. Include this in the release notes:

```bash
xattr -cr /Applications/OptaPrompter.app
```

Long-term fix: Apple Developer Program membership ($99/yr) → notarization → warning disappears.

---

## SMTP setup (Mailjet)

Supabase's built-in email is rate-limited (~2/hour) and unreliable. Custom SMTP via Mailjet gives 200 emails/day free forever.

1. https://mailjet.com → sign up.
2. **Senders & Domains** → add and verify your sender email address.
3. **Account Settings → SMTP** — copy the API Key + Secret Key.
4. Supabase → **Auth → SMTP Settings**:
   ```
   Host:     in-v3.mailjet.com
   Port:     587
   Username: <API Key>
   Password: <Secret Key>
   Sender:   <verified email>
   ```
5. Save. Retry sign-in → magic-link OTP arrives in ~5s.

**Gotcha:** Resend's sandbox domain (`onboarding@resend.dev`) only sends emails to your own Resend account. Won't work for other users. That's why we recommend Mailjet or a verified domain in Resend.

---

# Where scale would first bite

Non-breaking things to watch as usage grows:

- **Base64 images bloat `y_state`.** Every pasted screenshot inflates the Yjs snapshot by ~1.3× its raw size. Fine for 1-2 images per script; add Supabase Storage upload path when you cross ~5 per script.
- **Room codes never expire.** Leaked code = anyone with an account can join. Add `is_public` bool + explicit collaborator list later (table already exists, currently unused).
- **Supabase Realtime free tier** — 200 concurrent WebSocket connections. Every open editor + reader counts. Fine for MVP.
- **Mailjet free tier** — 200 emails/day. One OTP sign-in = one email.
- **Unsigned macOS app** — every new user runs `xattr -cr`. $99/yr Apple Developer + notarization removes this.

## What we didn't build (yet)

- Explicit collaborator invites (per-script access list vs. today's room-code sharing).
- Supabase Storage-backed image uploads.
- Windows / Intel-Mac / Linux binaries.
- Persistent window position between launches.
- Signed / notarized macOS app.
- Presenter analytics (session timer + WPM tracking → post-run report).
- CRDT-level version history / undo.

Each is a self-contained addition — the architecture is set up so any of them slots in without touching the sync layer.

---

# Common commands

```bash
npm run dev:web          # Next.js dev → http://localhost:3000
npm run dev:desktop      # Tauri dev — hot reload for both Rust and React

npm run build:web        # Next.js production build (Vercel runs this)
npm run build:desktop    # Tauri release build → .dmg / .msi / .AppImage
```

Desktop-only from `desktop/`:
```bash
npm run tauri dev        # same as dev:desktop from root
npm run tauri build      # same as build:desktop from root (requires icons)
```

---

# Troubleshooting

**"Missing VITE_SUPABASE_URL" when launching the desktop app**
→ `desktop/.env.local` doesn't exist. Copy it from the root: `cp .env.local desktop/.env.local`.

**"Module not found: Can't resolve './types'" during Vercel build**
→ `packages/shared/src/index.ts` references a deleted file. Should only export `yjs` and `yjs-provider`.

**Vercel build fails with TypeScript strict-mode errors**
→ Next.js prod builds run `tsc --noEmit`. Look for implicit `any` types on callbacks (Supabase cookie `setAll`, ProseMirror handlers) and add explicit types.

**Vercel build fails: `Cannot find package '@optaprompter/shared'`**
→ `vercel.json` install command must be `cd .. && npm install` so Vercel installs from the monorepo root and sets up workspace links.

**"failed to run cargo metadata" when starting desktop**
→ Rust isn't installed. `curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh`, then `source "$HOME/.cargo/env"`.

**Desktop `proc-macro panicked` at `generate_context!()`**
→ Icons missing. Regenerate:
```bash
cd desktop && ./node_modules/.bin/tauri icon /path/to/1024x1024.png --output src-tauri/icons
```

**"Infinite recursion detected in policy for relation scripts"**
→ You ran `0001_init.sql` but not `0002_fix_rls_recursion.sql`. Run 0002.

**Overlay appears in Zoom screen share**
→ macOS: confirm `"macOSPrivateApi": true` in `tauri.conf.json`. Windows: some virtual GPU drivers (Parallels, WSLg) silently drop `WDA_EXCLUDEFROMCAPTURE`. Linux: no OS API — expected limitation.

**Overlay goes behind Chrome/PowerPoint fullscreen**
→ Only fixed after all four of: NSPanel class swap, `NonactivatingPanel` style, `Accessory` activation policy, `canJoinAllSpaces + fullScreenAuxiliary` collection behavior. All handled in `window_protection.rs`; verify by looking for `[optaprompter] level=101 ...` in the terminal output.

**Keyboard input doesn't work in desktop auth / picker screens**
→ Overlay mode (with `NonactivatingPanel`) blocks input. The Reader `useEffect` should call `enter_overlay_mode` on mount and `leave_overlay_mode` on unmount so auth screens stay in baseline mode.

**"Unexpected failure — Error sending magic link email"**
→ Supabase's built-in email is hitting rate limits, or Resend sandbox doesn't allow the recipient. Set up Mailjet SMTP (see above).

**Downloaded `.dmg` says "damaged and can't be opened"**
→ Unsigned app + Gatekeeper quarantine. Fix once:
```bash
xattr -cr /Applications/OptaPrompter.app
```

**Users hit 404 on the release URL**
→ Repo is private. Either add users as collaborators, host the `.dmg` on Dropbox/Drive with a public share link, or make the repo public.

**Signed in as the wrong (previously-logged-in) user**
→ Stale session in `localStorage`. AuthGate now calls `signOut` on mount, but if the session was created before this fix, sign out once explicitly to clear it.

**"Cannot find module '@tiptap/extension-image'"**
→ Run `npm install` at the repo root. `@tiptap/extension-image` is a recent addition to `package.json`.

**I want to reset everything**
```bash
rm -rf node_modules web/.next desktop/src-tauri/target desktop/dist
npm install
```
