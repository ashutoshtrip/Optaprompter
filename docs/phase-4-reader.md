# Phase 4 — Tauri reader UI + realtime sync

## What this phase gives you

- Full desktop reader wired to the same Y.Doc as the web editor.
- Auth flow (email + password) with persisted session.
- Room picker: list of your scripts + manual room-code join.
- Overlay controls: play/pause, scroll speed, font size, opacity, session timer, screen-share visibility toggle, click-through toggle.
- In-window keyboard shortcuts + the existing global hotkey.

## Screen flow

```
launch → AuthGate (sign in / sign up)
       → RoomPicker (list scripts, or enter code)
       → Reader (Tiptap read-only + overlay controls)
```

## Real-time behavior

The reader mounts a `SupabaseYjsProvider` with `writable: false`. It:
1. Fetches the current `y_state` snapshot from Postgres → applies to local `Y.Doc`.
2. Joins the `room:{roomId}` broadcast channel.
3. Every Yjs update from any web editor arrives via broadcast in **<100 ms**, applies through `Y.applyUpdate`, and Tiptap re-renders the read-only view instantly.

Because `writable: false`, the reader never writes back to `scripts.y_state`, so a viewer can't corrupt shared state even if RLS would allow it.

## Keyboard shortcuts

| Key                    | Action                            | Scope   |
| ---------------------- | --------------------------------- | ------- |
| `Cmd/Ctrl + Shift + P` | Toggle click-through              | Global  |
| `Space`                | Play / pause auto-scroll          | Window  |
| `↑` / `↓`              | Speed −/+ (10 px/sec)             | Window  |
| `+` / `-`              | Font size ±2 px                   | Window  |
| `R`                    | Reset session timer               | Window  |

Only click-through is global — the rest require the overlay to be in
"interactive" mode (click-through off). That's intentional: when the
presenter is driving slides behind the overlay they don't want any of these
keys to fire.

## Verifying end-to-end

1. Web app: sign in, create a script called "Kickoff", note the room code (e.g. `K7XM-P29A`).
2. Type a few paragraphs.
3. Desktop app: sign in with the same account, pick "Kickoff" from the list.
4. Type more in the web app → text appears in the desktop overlay within ~100 ms.
5. Start a Zoom call and screen-share your monitor → the overlay is not visible to the receiver, but the underlying PowerPoint deck is.
6. Press `Cmd/Ctrl + Shift + P` → click through the overlay to advance slides. Press again to regain control.
7. Press `Space` to auto-scroll while you speak.

## Known limitations

- **Linux capture protection**: Wayland/X11 have no equivalent to `WDA_EXCLUDEFROMCAPTURE` / `NSWindowSharingTypeNone`. On Linux the overlay will appear in shared screens.
- **Password auth on desktop**: matches the spec's "Email/Password or Magic Link" option. Magic link on desktop would require a `tauri://` deep-link handler — deferred to Phase 5.
- **First-load `y_state` may be `null`** for a brand-new script. The provider handles this gracefully — the reader just shows an empty document until the first web edit lands, at which point CRDT convergence takes over.
