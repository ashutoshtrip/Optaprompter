//! OS-level "invisible to screen share" plumbing.
//!
//! Tauri v2's `WebviewWindow::set_content_protected` calls the right native
//! API on every platform, so this module is a thin, documented wrapper:
//!
//! | OS      | Mechanism                                                      |
//! |---------|----------------------------------------------------------------|
//! | macOS   | `NSWindow.sharingType = NSWindowSharingTypeNone`               |
//! |         | (requires `"macOSPrivateApi": true` in tauri.conf.json)        |
//! | Windows | `SetWindowDisplayAffinity(WDA_EXCLUDEFROMCAPTURE)`             |
//! | Linux   | best-effort — Wayland/X11 have no equivalent; call is a no-op  |
//!
//! Keeping this in its own module means the call site in `lib.rs` reads
//! intent-first (`set_capture_protection(&window, true)`) instead of the
//! opaque `set_content_protected` from the Tauri API.

use tauri::{Runtime, WebviewWindow};

pub fn set_capture_protection<R: Runtime>(
    window: &WebviewWindow<R>,
    protected: bool,
) -> tauri::Result<()> {
    window.set_content_protected(protected)
}
