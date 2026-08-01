# OptaPrompter

A collaborative teleprompter. Your team edits the script live in a browser (Google-Docs style); the presenter reads it from a desktop overlay that is **invisible to Zoom, Meet, and Teams** while still visible on the presenter's own monitor.

- `web/` — Next.js editor (Tiptap + Yjs)
- `desktop/` — Tauri v2 transparent overlay reader
- `packages/shared/` — shared Supabase client + Yjs realtime provider
- `supabase/migrations/` — Postgres schema (users, scripts, RLS)

---

## 1. Prerequisites

Install once per machine:

| Tool          | Version | Install                                                                     |
| ------------- | ------- | --------------------------------------------------------------------------- |
| **Node.js**   | ≥ 20    | https://nodejs.org or `nvm install 20`                                     |
| **Rust**      | stable  | `curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs \| sh`           |
| **Tauri deps**| —       | See platform-specific below                                                 |
| **Supabase**  | free    | Create an account at https://supabase.com                                   |

**macOS Tauri deps:** `xcode-select --install`

**Windows Tauri deps:** [Microsoft C++ Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/) + [WebView2](https://developer.microsoft.com/en-us/microsoft-edge/webview2/) (usually pre-installed)

**Linux Tauri deps:**
```bash
sudo apt install -y libwebkit2gtk-4.1-dev libssl-dev libayatana-appindicator3-dev librsvg2-dev build-essential curl wget file
```

Confirm everything is ready:
```bash
node -v      # v20+
cargo -V     # cargo 1.75+
```

---

## 2. Set up Supabase (5 minutes)

1. Go to https://supabase.com → **New project**. Pick any region; the free tier is enough.
2. Wait ~1 minute for provisioning.
3. In the sidebar go to **SQL Editor → New query**, paste the entire contents of [`supabase/migrations/0001_init.sql`](supabase/migrations/0001_init.sql), then **Run**. You should see "Success. No rows returned".
4. In **Authentication → Providers**, keep **Email** enabled. For faster local testing, turn **off** "Confirm email" (Authentication → Providers → Email → Confirm email = disabled). You can re-enable in production.
5. In **Authentication → URL Configuration**, add these to **Redirect URLs**:
   - `http://localhost:3000/auth/callback`
   - `http://localhost:3000/**`
6. In **Project Settings → API**, copy two values (you'll paste them in the next step):
   - **Project URL** — looks like `https://abcxyz.supabase.co`
   - **anon public key** — a long `eyJ…` string

---

## 3. Configure environment

From the repo root:

```bash
cp .env.example .env.local
```

Open `.env.local` and set **all four** values to what you copied (`NEXT_PUBLIC_*` for the web app, `VITE_*` for the desktop app — they point at the same Supabase project):

```env
NEXT_PUBLIC_SUPABASE_URL=https://abcxyz.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOi...
VITE_SUPABASE_URL=https://abcxyz.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOi...
```

The desktop app reads its env from `desktop/.env.local` too — the easiest way is to symlink:

```bash
ln -sf ../.env.local desktop/.env.local
```

(On Windows: `copy .env.local desktop\.env.local` — remember to re-copy if you change the root file.)

---

## 4. Install dependencies

From the repo root:

```bash
npm install
```

This installs all three workspaces (`web`, `desktop`, `packages/shared`) in one shot. First run takes 1-2 minutes.

---

## 5. Run the web app

```bash
npm run dev:web
```

Open http://localhost:3000. You should see the OptaPrompter landing page. Click **Sign in**, enter an email + password, click **Create account** (bottom toggle). You're logged in.

Leave this terminal running.

---

## 6. Run the desktop app

Open a **second terminal** in the repo root:

```bash
npm run dev:desktop
```

First run compiles the Rust backend — expect **~2 minutes**. Subsequent runs launch in seconds. A small transparent, borderless window appears floating on top of your other apps.

Sign in on the desktop app with the **same account** you created in the browser.

---

## 7. Test the application

### 7a. Test real-time sync (both apps open)

1. In the **browser** (http://localhost:3000/dashboard), type a title like "Test script" → **Create**. You'll be dropped into the editor.
2. Type a few paragraphs of text.
3. Note the **room code** in the top-right (e.g. `K7XM-P29A`).
4. Switch to the **desktop app** — you should see "Test script" in the picker. Click it.
5. Go back to the browser, add or delete text.
6. **The desktop overlay updates within ~100 ms.**

Status pill top-right of the reader shows `connecting → synced`.

### 7b. Test screen-share invisibility (the core feature)

1. Start a Zoom, Google Meet, or Microsoft Teams call (a call with yourself works — join a personal room in a second browser).
2. Click **Share screen → Entire screen** (not "just this window").
3. On the receiving side, you should see your desktop and any open apps — **but not the OptaPrompter overlay**.
4. On your own monitor, the overlay is still fully visible and floats above everything.

Toggle the **Hidden / Visible** button in the top-right of the reader to confirm the flag works both ways (Visible → the overlay appears on the receiver; Hidden → it disappears again).

> **macOS + Windows only.** Linux (Wayland/X11) has no equivalent OS API — the overlay will appear in shared screens there.

### 7c. Test click-through mode

1. Open PowerPoint / Keynote / any full-screen app behind the overlay.
2. Press **`Cmd + Shift + P`** (macOS) or **`Ctrl + Shift + P`** (Windows/Linux). The indicator dot next to "Click-thru" turns green.
3. Click anywhere in the overlay — the click passes through to the app behind (you can advance slides).
4. Press the hotkey again to regain control of the overlay.

The hotkey is global — it works even when the overlay isn't focused.

### 7d. Test the teleprompter controls

With the reader open and click-through **off**:

| Key         | Effect                       |
| ----------- | ---------------------------- |
| `Space`     | Play / pause auto-scroll     |
| `↑` / `↓`   | Scroll speed ± 10 px/sec     |
| `+` / `-`   | Font size ± 2 px             |
| `R`         | Reset session timer          |

Or drag the sliders in the control bar.

### 7e. Test collaboration

1. Open the same script in **two browser windows** (or two devices).
2. Type in one — the other shows the changes live with a coloured cursor label.
3. The desktop overlay reflects all changes.

---

## 8. Common commands reference

Run from the repo root:

```bash
npm run dev:web          # Next.js dev server → http://localhost:3000
npm run dev:desktop      # Tauri dev — hot reload for both Rust and React

npm run build:web        # Production build of the web app
npm run build:desktop    # Bundle the desktop app (.dmg / .msi / .AppImage)
```

Desktop-only commands (run from `desktop/`):

```bash
npm run tauri dev        # same as `npm run dev:desktop` above
npm run tauri build      # release bundle (requires icons — see below)
```

---

## 9. Troubleshooting

**"Missing VITE_SUPABASE_URL" when launching the desktop app.**
Make sure `desktop/.env.local` exists (see step 3 — symlink or copy from root).

**"Error: WebviewNotFound" in Rust logs.**
The overlay window failed to launch. Check that `desktop/src-tauri/tauri.conf.json` still contains a window with `"label": "prompter"`.

**Overlay appears in screen share on macOS.**
Confirm `"macOSPrivateApi": true` is set in `tauri.conf.json` and that you're on macOS 10.15 or newer.

**Overlay appears in screen share on Windows.**
Some virtual GPU drivers (older Parallels, WSLg, remote-desktop-in-a-VM setups) silently drop the `WDA_EXCLUDEFROMCAPTURE` flag. Test on native hardware. The Rust module `window_protection::windows_diag::check_display_affinity` can confirm whether the flag stuck.

**Rust build fails on first run.**
Delete `desktop/src-tauri/target/` and re-run. If it complains about `webkit2gtk` on Linux, install the deps from the prerequisites section above.

**Realtime updates aren't arriving.**
Check the status pill in the desktop reader. If it stays at `connecting` / `error`, verify your Supabase URL / anon key and that the `scripts` table has RLS enabled with the policies from `0001_init.sql`.

**"Invalid login credentials" on the desktop.**
If you enabled "Confirm email" in Supabase, the account can't sign in until the confirmation email is clicked. Either disable email confirmation for local dev, or confirm via the emailed link first.

**I want to reset everything.**
```bash
rm -rf node_modules web/.next desktop/src-tauri/target desktop/dist
npm install
```

---

## 10. Where to go next

- Per-phase implementation notes:
  - [Phase 1 — Setup](docs/phase-1-setup.md)
  - [Phase 2 — Desktop overlay](docs/phase-2-desktop.md)
  - [Phase 3 — Web editor](docs/phase-3-editor.md)
  - [Phase 4 — Reader + realtime](docs/phase-4-reader.md)
- To ship a release build of the desktop app, generate icons first:
  ```bash
  cd desktop/src-tauri
  npx @tauri-apps/cli icon /path/to/your-1024x1024.png
  npm run tauri build
  ```
- To deploy the web app: push to GitHub and import into Vercel. Add the four env vars (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and the two `VITE_*` versions aren't needed on Vercel) in the project settings. Update Supabase's Redirect URLs to include your Vercel domain.
