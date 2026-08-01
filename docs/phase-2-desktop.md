# Phase 2 — Tauri overlay

## What this phase gives you

- Transparent, borderless, always-on-top window (`desktop/src-tauri/tauri.conf.json`).
- OS-level screen-share invisibility on macOS + Windows (`window_protection.rs`).
- Click-through toggle (`set_ignore_cursor_events`) with a global hotkey.
- Rust ↔ JS command bridge for opacity, click-through, capture protection.

## Files

```
desktop/
├── package.json                       # Vite + React + Tauri v2 CLI
├── vite.config.ts                     # port 1420, Tauri env prefixes
├── index.html
└── src/
    ├── main.tsx
    ├── App.tsx                        # Phase-2 shell (real reader → Phase 4)
    └── styles.css
desktop/src-tauri/
├── Cargo.toml                         # tauri v2, global-shortcut, objc2, windows
├── build.rs
├── tauri.conf.json                    # transparent, decorations off, contentProtected
├── capabilities/default.json          # permissions for setIgnoreCursorEvents etc.
└── src/
    ├── main.rs                        # entry (thin)
    ├── lib.rs                         # commands, hotkey, setup
    └── window_protection.rs           # NSWindowSharingTypeNone / WDA_EXCLUDEFROMCAPTURE
```

## Running

```bash
cd desktop
npm install                        # installs from workspace root; safe to re-run
npm run tauri dev
```

First run compiles Rust deps (~2 min). Subsequent runs are seconds.

## Verifying screen-share invisibility

1. Launch: `npm run tauri dev`
2. Start a Zoom / Meet / Teams call → **Share entire screen**.
3. On the receiving side, the overlay is **not** visible.
4. On your own monitor, it is fully visible and floats above every app.

If the overlay *does* appear on the receiver:

- **macOS:** confirm `macOSPrivateApi: true` in `tauri.conf.json` and that you're on macOS 10.15+.
- **Windows:** some virtual GPU drivers (e.g., older Parallels, WSLg) silently drop `WDA_EXCLUDEFROMCAPTURE`. Test on native hardware. You can call the diagnostic helper in `window_protection::windows_diag::check_display_affinity` to verify.
- **Linux:** Wayland/X11 have no equivalent kernel API; this is a documented limitation.

## Verifying click-through

1. Press `Cmd/Ctrl + Shift + P` — the indicator dot flips green.
2. Click anywhere inside the overlay: the click passes to the app behind (PowerPoint, browser, etc.).
3. Press the hotkey again to regain interaction.

The hotkey works whether the overlay is focused or not (it's a system-wide `GlobalShortcut`).

## Commands exposed to JS

| Command                    | Args             | Returns |
| -------------------------- | ---------------- | ------- |
| `get_click_through`        | –                | `bool`  |
| `get_content_protected`    | –                | `bool`  |
| `toggle_click_through`     | –                | `bool`  |
| `set_click_through`        | `{ ignore }`     | `bool`  |
| `toggle_content_protected` | –                | `bool`  |
| `set_content_protected`    | `{ protected }`  | `bool`  |
| `overlay_status`           | –                | `{ click_through, content_protected }` |

Event `click-through-changed` fires whenever state changes (hotkey or JS-driven), so any React component can subscribe.
