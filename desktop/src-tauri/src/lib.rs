//! OptaPrompter — Tauri backend.
//!
//!   * Configure the transparent, always-on-top, borderless overlay window.
//!   * Toggle OS-level screen-share exclusion (see `window_protection`).
//!   * Toggle click-through (`set_ignore_cursor_events`) so the presenter can
//!     click the slide deck behind the overlay.
//!   * Global hotkeys that work from anywhere (even when PowerPoint has focus).

mod window_protection;

use parking_lot::Mutex;
use std::sync::Arc;
use tauri::{Emitter, Manager, WebviewWindow};
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};

const OVERLAY_LABEL: &str = "prompter";

#[derive(Default)]
struct OverlayState {
    click_through: bool,
    content_protected: bool,
}

type SharedState = Arc<Mutex<OverlayState>>;

fn overlay<R: tauri::Runtime>(app: &tauri::AppHandle<R>) -> tauri::Result<WebviewWindow<R>> {
    app.get_webview_window(OVERLAY_LABEL)
        .ok_or_else(|| tauri::Error::WebviewNotFound)
}

fn apply_click_through<R: tauri::Runtime>(
    window: &WebviewWindow<R>,
    ignore: bool,
) -> tauri::Result<()> {
    window.set_ignore_cursor_events(ignore)
}

/// Match a shortcut against BOTH the mac (SUPER) and win/linux (CONTROL)
/// variants of the same "CmdOrCtrl+..." combo.
fn matches_cmd_or_ctrl(shortcut: &Shortcut, extra_mods: Modifiers, code: Code) -> bool {
    shortcut.matches(Modifiers::SUPER | extra_mods, code)
        || shortcut.matches(Modifiers::CONTROL | extra_mods, code)
}

#[tauri::command]
fn get_click_through(state: tauri::State<'_, SharedState>) -> bool {
    state.lock().click_through
}

#[tauri::command]
fn get_content_protected(state: tauri::State<'_, SharedState>) -> bool {
    state.lock().content_protected
}

#[tauri::command]
fn toggle_click_through(
    app: tauri::AppHandle,
    state: tauri::State<'_, SharedState>,
) -> Result<bool, String> {
    let mut s = state.lock();
    s.click_through = !s.click_through;
    let next = s.click_through;
    drop(s);

    let w = overlay(&app).map_err(|e| e.to_string())?;
    apply_click_through(&w, next).map_err(|e| e.to_string())?;
    let _ = app.emit("click-through-changed", next);
    Ok(next)
}

#[tauri::command]
fn toggle_content_protected(
    app: tauri::AppHandle,
    state: tauri::State<'_, SharedState>,
) -> Result<bool, String> {
    let mut s = state.lock();
    s.content_protected = !s.content_protected;
    let next = s.content_protected;
    drop(s);

    let w = overlay(&app).map_err(|e| e.to_string())?;
    window_protection::set_capture_protection(&w, next).map_err(|e| e.to_string())?;
    Ok(next)
}

#[tauri::command]
fn enter_overlay_mode(app: tauri::AppHandle) -> Result<(), String> {
    let w = overlay(&app).map_err(|e| e.to_string())?;
    window_protection::enter_overlay_mode(&w);
    Ok(())
}

#[tauri::command]
fn leave_overlay_mode(app: tauri::AppHandle) -> Result<(), String> {
    let w = overlay(&app).map_err(|e| e.to_string())?;
    window_protection::leave_overlay_mode(&w);
    Ok(())
}

#[tauri::command]
fn quit_app(app: tauri::AppHandle) {
    app.exit(0);
}

pub fn run() {
    let state: SharedState = Arc::new(Mutex::new(OverlayState {
        click_through: false,
        content_protected: true,
    }));

    tauri::Builder::default()
        .manage(state.clone())
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(move |app, shortcut, event| {
                    if event.state() != ShortcutState::Pressed {
                        return;
                    }

                    // Cmd/Ctrl + Shift + P → toggle click-through
                    if matches_cmd_or_ctrl(shortcut, Modifiers::SHIFT, Code::KeyP) {
                        let app = app.clone();
                        tauri::async_runtime::spawn(async move {
                            if let Some(state) = app.try_state::<SharedState>() {
                                let mut s = state.lock();
                                s.click_through = !s.click_through;
                                let next = s.click_through;
                                drop(s);
                                if let Ok(w) = overlay(&app) {
                                    let _ = apply_click_through(&w, next);
                                }
                                let _ = app.emit("click-through-changed", next);
                            }
                        });
                        return;
                    }

                    // Cmd/Ctrl + Shift + T → toggle toolbar visibility
                    if matches_cmd_or_ctrl(shortcut, Modifiers::SHIFT, Code::KeyT) {
                        let _ = app.emit("prompter:toggle-toolbar", ());
                        return;
                    }

                    // Cmd/Ctrl + Shift + Space → play / pause auto-scroll
                    if matches_cmd_or_ctrl(shortcut, Modifiers::SHIFT, Code::Space) {
                        let _ = app.emit("prompter:toggle-play", ());
                        return;
                    }

                    // Cmd/Ctrl + Shift + ↑/↓ → scroll speed −/+
                    if matches_cmd_or_ctrl(shortcut, Modifiers::SHIFT, Code::ArrowUp) {
                        let _ = app.emit("prompter:speed-delta", -10i32);
                        return;
                    }
                    if matches_cmd_or_ctrl(shortcut, Modifiers::SHIFT, Code::ArrowDown) {
                        let _ = app.emit("prompter:speed-delta", 10i32);
                        return;
                    }

                    // Cmd/Ctrl + Shift + +/- → font size ±
                    if matches_cmd_or_ctrl(shortcut, Modifiers::SHIFT, Code::Equal) {
                        let _ = app.emit("prompter:font-delta", 2i32);
                        return;
                    }
                    if matches_cmd_or_ctrl(shortcut, Modifiers::SHIFT, Code::Minus) {
                        let _ = app.emit("prompter:font-delta", -2i32);
                        return;
                    }

                    // Cmd/Ctrl + Shift + R → reset timer
                    if matches_cmd_or_ctrl(shortcut, Modifiers::SHIFT, Code::KeyR) {
                        let _ = app.emit("prompter:reset-timer", ());
                        return;
                    }

                    // Cmd/Ctrl + Shift + Q → quit the app
                    if matches_cmd_or_ctrl(shortcut, Modifiers::SHIFT, Code::KeyQ) {
                        app.exit(0);
                    }
                })
                .build(),
        )
        .setup(|app| {
            let gs = app.global_shortcut();

            // Register every global hotkey. Both SUPER and CONTROL variants
            // so the same physical shortcut works on macOS + Win/Linux.
            let mods_shift = Modifiers::SHIFT;
            let register_all = |code: Code| {
                let _ = gs.register(Shortcut::new(Some(Modifiers::SUPER | mods_shift), code));
                let _ = gs.register(Shortcut::new(Some(Modifiers::CONTROL | mods_shift), code));
            };
            register_all(Code::KeyP);       // click-through
            register_all(Code::KeyT);       // toolbar visibility
            register_all(Code::Space);      // play/pause
            register_all(Code::ArrowUp);    // speed −
            register_all(Code::ArrowDown);  // speed +
            register_all(Code::Equal);      // font size +
            register_all(Code::Minus);      // font size −
            register_all(Code::KeyR);       // reset timer
            register_all(Code::KeyQ);       // quit app

            if let Some(w) = app.get_webview_window(OVERLAY_LABEL) {
                // Baseline: always-on-top + content-protected. Keeps normal
                // keyboard input so auth/picker screens work. The overlay
                // stack (accessory, nonactivating panel, fullscreen visibility)
                // is toggled from JS via `enter_overlay_mode` / `leave_overlay_mode`
                // as the user navigates between reader and picker/auth.
                window_protection::apply_baseline(&w);
                let _ = window_protection::set_capture_protection(&w, true);
                let _ = apply_click_through(&w, false);
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_click_through,
            get_content_protected,
            toggle_click_through,
            toggle_content_protected,
            enter_overlay_mode,
            leave_overlay_mode,
            quit_app,
        ])
        .run(tauri::generate_context!())
        .expect("error while running OptaPrompter");
}
