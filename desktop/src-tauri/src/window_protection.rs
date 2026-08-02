//! OS-level overlay hardening.
//!
//! Two things this module does that go beyond Tauri's built-in APIs:
//!
//! 1. **Screen-share invisibility** — Tauri v2's `set_content_protected`
//!    already sets `NSWindowSharingTypeNone` (macOS) and
//!    `WDA_EXCLUDEFROMCAPTURE` (Windows). We just wrap it.
//!
//! 2. **Always-on-top that actually stays on top** — Tauri's
//!    `alwaysOnTop: true` only sets `NSWindowLevel::Floating` (3) on macOS.
//!    That's enough for normal windows, but Chrome fullscreen video,
//!    Keynote/PPT presenter mode, and some macOS fullscreen apps still sit
//!    above it. We raise the level (just below screen-saver) and set the
//!    collection behavior so the overlay follows the presenter into
//!    fullscreen spaces too.

use tauri::{Runtime, WebviewWindow};

pub fn set_capture_protection<R: Runtime>(
    window: &WebviewWindow<R>,
    protected: bool,
) -> tauri::Result<()> {
    window.set_content_protected(protected)
}

/// Call once at startup (and any time you re-show the overlay) to guarantee
/// it floats above everything, including full-screen apps.
pub fn harden_always_on_top<R: Runtime>(window: &WebviewWindow<R>) {
    let _ = window.set_always_on_top(true);
    let _ = window.set_visible_on_all_workspaces(true);

    #[cfg(target_os = "macos")]
    macos::raise_level_and_collection_behavior(window);
}

#[cfg(target_os = "macos")]
mod macos {
    use cocoa::base::id;
    use objc::{msg_send, sel, sel_impl};
    use tauri::{Runtime, WebviewWindow};

    // NSFloatingWindowLevel is 3. Screen-saver is 1000. We sit just under
    // screen-saver so system-critical UI still wins, but Chrome fullscreen,
    // PPT/Keynote presenter mode, and other fullscreen apps do not.
    const OVERLAY_LEVEL: i64 = 999;

    // NSWindowCollectionBehavior bits — passed as raw u64 to avoid any
    // bitflags-struct ABI surprises going through `msg_send!`.
    const NSWCB_CAN_JOIN_ALL_SPACES: u64 = 1 << 0;
    const NSWCB_STATIONARY: u64 = 1 << 4;
    const NSWCB_IGNORES_CYCLE: u64 = 1 << 6;
    const NSWCB_FULL_SCREEN_AUXILIARY: u64 = 1 << 8;

    pub fn raise_level_and_collection_behavior<R: Runtime>(window: &WebviewWindow<R>) {
        let Ok(ns_window_ptr) = window.ns_window() else {
            eprintln!("[optaprompter] ns_window() failed");
            return;
        };
        if ns_window_ptr.is_null() {
            eprintln!("[optaprompter] ns_window() returned null");
            return;
        }
        let ns_window = ns_window_ptr as id;

        let behavior: u64 = NSWCB_CAN_JOIN_ALL_SPACES
            | NSWCB_STATIONARY
            | NSWCB_IGNORES_CYCLE
            | NSWCB_FULL_SCREEN_AUXILIARY;

        // SAFETY: `ns_window` is a valid NSWindow* while the Tauri window
        // exists. All selectors used here are stable AppKit APIs.
        unsafe {
            let _: () = msg_send![ns_window, setLevel: OVERLAY_LEVEL];
            let _: () = msg_send![ns_window, setCollectionBehavior: behavior];
            let _: () = msg_send![ns_window, setHidesOnDeactivate: false];

            // Read back to confirm the level stuck.
            let effective_level: i64 = msg_send![ns_window, level];
            eprintln!(
                "[optaprompter] set NSWindow.level={} (requested {}), collectionBehavior={:#x}",
                effective_level, OVERLAY_LEVEL, behavior
            );
        }
    }
}
