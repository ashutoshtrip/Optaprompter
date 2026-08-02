# Deploying OptaPrompter to customer zero

Two independent halves:

1. **Web** → Vercel (public URL your customer signs in / edits scripts from).
2. **Desktop** → build a `.dmg` locally, upload to GitHub Releases, send the download link.

Both apps talk to the same Supabase project you already have.

---

## Part 1 — Web app on Vercel

### 1a. Push to GitHub

Make sure `.env.local` files are tracked (you chose to keep them for now — they contain the Supabase anon key which is public-safe under RLS). Commit any pending changes and push:

```bash
cd ~/Desktop/OptaPrompter
git add .
git commit -m "Ready for customer-zero deploy"
git push
```

### 1b. Import on Vercel

1. Go to https://vercel.com/new → **Import Git Repository** → pick your `OptaPrompter` repo.
2. On the "Configure Project" screen:
   - **Framework Preset**: Next.js (auto-detected).
   - **Root Directory**: click **Edit** → set to `web`.
   - **Build/Output/Install** — leave alone; the `web/vercel.json` file already tells Vercel to install from the monorepo root and run `npm run build:web`.
3. Under **Environment Variables**, add these (values from your `.env.local`):

   ```
   NEXT_PUBLIC_SUPABASE_URL      https://dfvqvilbnnyzxxpjuvrl.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY <your anon key>
   ```

4. Click **Deploy**. First build takes ~2 minutes.

### 1c. Add the Vercel domain to Supabase redirect URLs

Vercel gives you a URL like `https://optaprompter-abc123.vercel.app`. Copy it, then:

1. Supabase dashboard → **Authentication → URL Configuration → Redirect URLs**.
2. Add both:
   - `https://your-app.vercel.app/**`
   - `https://your-app.vercel.app/auth/callback`
3. Save.

Without this, magic-link sign-in from the deployed web app will fail with "invalid redirect URL".

### 1d. Test the web deploy

Open the Vercel URL, sign up with a fresh email (or the same you used locally), verify the magic-link email works, create a script. If everything works, part 1 is done.

---

## Part 2 — Desktop app (`.dmg` for Apple Silicon)

### 2a. Build

From `~/Desktop/OptaPrompter`:

```bash
npm run build:desktop
```

That runs `tauri build` under the hood. First release build takes ~3-5 minutes. Output lands here:

```
desktop/src-tauri/target/release/bundle/
├── macos/OptaPrompter.app       # the raw app bundle
└── dmg/OptaPrompter_0.1.0_aarch64.dmg   # ← this is what you share
```

### 2b. Test the built app locally

Double-click the `.dmg` → drag `OptaPrompter.app` to `/Applications` → launch it.

Because the app isn't code-signed, macOS Gatekeeper will refuse to open it on first launch with the message *"OptaPrompter cannot be opened because the developer cannot be verified."*

**How to bypass** (do this once per Mac):
1. Right-click `OptaPrompter.app` → **Open**.
2. In the dialog that appears, click **Open** again.
3. From then on, double-click works normally.

Or from Terminal:
```bash
xattr -d com.apple.quarantine /Applications/OptaPrompter.app
```

### 2c. Update version + rebuild (each release)

Bump the version in two places before every build:

- `desktop/package.json` — `"version": "0.1.0"`
- `desktop/src-tauri/tauri.conf.json` — `"version": "0.1.0"`
- `desktop/src-tauri/Cargo.toml` — `version = "0.1.0"`

Then re-run `npm run build:desktop`. The new `.dmg` file name reflects the new version.

---

## Part 3 — Upload to GitHub Releases

### 3a. Via web UI (easiest)

1. On GitHub, go to your repo → **Releases** (right sidebar) → **Draft a new release**.
2. **Choose a tag** → type `v0.1.0` → **Create new tag on publish**.
3. **Release title**: `v0.1.0 — customer zero`.
4. **Description**: paste this template:
   ```markdown
   ## Install (macOS, Apple Silicon only)
   
   1. Download `OptaPrompter_0.1.0_aarch64.dmg` below.
   2. Open the `.dmg`, drag OptaPrompter to Applications.
   3. **First launch:** right-click OptaPrompter in Applications → Open → Open (this bypasses the "unidentified developer" warning).
   4. Sign in with the same email you used at [web app URL].
   
   ## What's new
   - Initial customer-zero release.
   ```
5. **Attach binaries** — drag the `.dmg` file into the "Attach binaries" area.
6. **Publish release**.

### 3b. Or via `gh` CLI

```bash
cd ~/Desktop/OptaPrompter
gh release create v0.1.0 \
  desktop/src-tauri/target/release/bundle/dmg/OptaPrompter_0.1.0_aarch64.dmg \
  --title "v0.1.0 — customer zero" \
  --notes "Initial customer-zero release. macOS Apple Silicon only."
```

### 3c. Share the link

The download link looks like:
```
https://github.com/<you>/OptaPrompter/releases/download/v0.1.0/OptaPrompter_0.1.0_aarch64.dmg
```

**If the repo is private**, your customer will need read access to the repo to download. Add them as a collaborator, or make the release public via a signed URL.

---

## What to send customer zero

Copy this message to them:

> **Try OptaPrompter — collaborative teleprompter (private beta)**
>
> The web app is where scripts get written together (Google-Docs style). The desktop app is the transparent overlay that shows the script while you present — it's invisible on Zoom/Meet/Teams screen share.
>
> 1. **Web app:** https://<your-vercel-url>.vercel.app — sign in with your email.
> 2. **Desktop app** (Mac, Apple Silicon only): download from [GitHub release link].
>    - First launch: right-click → Open (Apple's "unidentified developer" warning; harmless).
>    - Sign in with the same email.
> 3. In the web app, create a script → copy the room code (top-right).
> 4. In the desktop app, pick the script from your list (or paste the room code).
> 5. Type in the web app; changes appear on the desktop overlay in real time.
>
> **Hotkeys** (all work while any app is focused):
> - `Cmd+Shift+P` — toggle click-through (so you can click PowerPoint behind the overlay)
> - `Cmd+Shift+T` — hide/show the toolbar
> - `Cmd+Shift+Space` — play/pause auto-scroll
> - `Cmd+Shift+↑/↓` — scroll speed
> - `Cmd+Shift+=/-` — font size
> - `Cmd+Shift+R` — reset session timer
>
> The overlay stays invisible during Zoom/Meet/Teams screen share — presenter sees it, audience doesn't.
>
> Reply here with any bugs or things that felt weird.

---

## Troubleshooting

**Vercel build fails with "Cannot find package '@optaprompter/shared'"**
The `vercel.json` install command must be `cd .. && npm install` so Vercel installs from the monorepo root (which sets up workspace links). Confirm that's in `web/vercel.json`.

**`.dmg` won't open at all — "damaged and can't be opened"**
Run in Terminal:
```bash
xattr -cr /Applications/OptaPrompter.app
```

**Customer zero: "app doesn't stay on top of Chrome fullscreen"**
Already handled — the app runs as an "accessory" app on macOS which is what enables cross-app fullscreen overlay. No Dock icon is intentional.

**Customer zero: "app won't launch at all"**
Check they're on Apple Silicon (`About This Mac` → Chip should say `Apple M1/M2/M3/…`). Intel Macs need a separate Intel build (or a universal binary — say the word and I'll wire it in).

**Vercel deploy 500 error on `/dashboard`**
Almost always means Supabase env vars aren't set on Vercel, or Redirect URLs don't include the Vercel domain. Recheck 1b and 1c.
