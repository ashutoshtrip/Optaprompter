//! OptaPrompter — Tauri backend.
//!
//! Responsibilities in Phase 2:
//!   * Configure the transparent, always-on-top, borderless overlay window.
//!   * Toggle OS-level screen-share exclusion (see `window_protection`).
//!   * Toggle click-through (`set_ignore_cursor_events`) so the presenter can
//!     click the slide deck behind the overlay.
//!   * Register a global hotkey (`CmdOrCtrl+Shift+P`) to toggle click-through
//!     from anywhere, even when the overlay is not focused.

mod window_protection;

use parking_lot::Mutex;
use serde::Serialize;
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

#[derive(Serialize, Clone)]
struct OverlayStatus {
    click_through: bool,
    content_protected: bool,
}

// -------- helpers ------------------------------------------------------------

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

// -------- commands -----------------------------------------------------------

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
fn set_click_through(
    ignore: bool,
    app: tauri::AppHandle,
    state: tauri::State<'_, SharedState>,
) -> Result<bool, String> {
    state.lock().click_through = ignore;
    let w = overlay(&app).map_err(|e| e.to_string())?;
    apply_click_through(&w, ignore).map_err(|e| e.to_string())?;
    let _ = app.emit("click-through-changed", ignore);
    Ok(ignore)
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
fn set_content_protected(
    protected: bool,
    app: tauri::AppHandle,
    state: tauri::State<'_, SharedState>,
) -> Result<bool, String> {
    state.lock().content_protected = protected;
    let w = overlay(&app).map_err(|e| e.to_string())?;
    window_protection::set_capture_protection(&w, protected).map_err(|e| e.to_string())?;
    Ok(protected)
}

#[tauri::command]
fn overlay_status(state: tauri::State<'_, SharedState>) -> OverlayStatus {
    let s = state.lock();
    OverlayStatus {
        click_through: s.click_through,
        content_protected: s.content_protected,
    }
}

// -------- entry --------------------------------------------------------------

pub fn run() {
    let state: SharedState = Arc::new(Mutex::new(OverlayState {
        click_through: false,
        content_protected: true, // default ON — the whole point of the app
    }));

    tauri::Builder::default()
        .manage(state.clone())
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(move |app, shortcut, event| {
                    if event.state() != ShortcutState::Pressed {
                        return;
                    }
                    if shortcut.matches(Modifiers::SUPER | Modifiers::SHIFT, Code::KeyP)
                        || shortcut.matches(Modifiers::CONTROL | Modifiers::SHIFT, Code::KeyP)
                    {
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
                    }
                })
                .build(),
        )
        .setup(|app| {
            // Register the two hotkey variants (Cmd on macOS, Ctrl elsewhere).
            let gs = app.global_shortcut();
            let cmd_shift_p = Shortcut::new(Some(Modifiers::SUPER | Modifiers::SHIFT), Code::KeyP);
            let ctrl_shift_p =
                Shortcut::new(Some(Modifiers::CONTROL | Modifiers::SHIFT), Code::KeyP);
            let _ = gs.register(cmd_shift_p);
            let _ = gs.register(ctrl_shift_p);

            // Enforce initial window protection (the manifest sets
            // contentProtected: true, but re-asserting via Rust also runs
            // the macOS window-level hardening).
            if let Some(w) = app.get_webview_window(OVERLAY_LABEL) {
                let _ = window_protection::set_capture_protection(&w, true);
                let _ = apply_click_through(&w, false);
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_click_through,
            get_content_protected,
            toggle_click_through,
            set_click_through,
            toggle_content_protected,
            set_content_protected,
            overlay_status,
        ])
        .run(tauri::generate_context!())
        .expect("error while running OptaPrompter");
}
