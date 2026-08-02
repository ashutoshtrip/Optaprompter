//! OS-level overlay hardening.

use tauri::{Runtime, WebviewWindow};

pub fn set_capture_protection<R: Runtime>(
    window: &WebviewWindow<R>,
    protected: bool,
) -> tauri::Result<()> {
    window.set_content_protected(protected)
}

/// Make the overlay float above everything — including apps in their own
/// fullscreen Space (Chrome fullscreen, PPT/Keynote presenter mode, etc.).
///
/// The tricks that matter on macOS:
///   * `setLevel:` to a value above regular windows.
///   * `setCollectionBehavior:` with `canJoinAllSpaces | fullScreenAuxiliary
///     | stationary | ignoresCycle` so the window is present in every
///     Space (including fullscreen Spaces created by other apps) and
///     doesn't move when the active Space changes.
///   * `orderFrontRegardless` to force the window forward without stealing
///     activation from the fullscreen app.
///   * `setHidesOnDeactivate: NO` so switching apps doesn't hide us.
pub fn harden_always_on_top<R: Runtime>(window: &WebviewWindow<R>) {
    let _ = window.set_always_on_top(true);
    let _ = window.set_visible_on_all_workspaces(true);

    #[cfg(target_os = "macos")]
    macos::apply(window);
}

#[cfg(target_os = "macos")]
mod macos {
    use cocoa::base::id;
    use objc::{msg_send, sel, sel_impl};
    use tauri::{Runtime, WebviewWindow};

    // NSPopUpMenuWindowLevel = 101 is the tier most macOS overlays use
    // (Zoom picture-in-picture, Rewind, CleanShot annotate). Higher than
    // regular windows and fullscreen app windows, lower than screen saver.
    const OVERLAY_LEVEL: i64 = 101;

    // NSWindowCollectionBehavior bits (passed as raw u64 to avoid bitflag
    // struct ABI issues going through msg_send!).
    const CAN_JOIN_ALL_SPACES: u64 = 1 << 0;
    const STATIONARY: u64 = 1 << 4;
    const IGNORES_CYCLE: u64 = 1 << 6;
    const FULL_SCREEN_AUXILIARY: u64 = 1 << 8;

    pub fn apply<R: Runtime>(window: &WebviewWindow<R>) {
        let Ok(ns_window_ptr) = window.ns_window() else {
            eprintln!("[optaprompter] ns_window() failed");
            return;
        };
        if ns_window_ptr.is_null() {
            eprintln!("[optaprompter] ns_window() returned null");
            return;
        }
        let ns_window = ns_window_ptr as id;

        let behavior: u64 =
            CAN_JOIN_ALL_SPACES | STATIONARY | IGNORES_CYCLE | FULL_SCREEN_AUXILIARY;

        unsafe {
            let _: () = msg_send![ns_window, setLevel: OVERLAY_LEVEL];
            let _: () = msg_send![ns_window, setCollectionBehavior: behavior];
            let _: () = msg_send![ns_window, setHidesOnDeactivate: false];
            // Force to front without stealing focus.
            let _: () = msg_send![ns_window, orderFrontRegardless];

            let effective_level: i64 = msg_send![ns_window, level];
            let effective_behavior: u64 = msg_send![ns_window, collectionBehavior];
            eprintln!(
                "[optaprompter] NSWindow.level={} (req {}), collectionBehavior={:#x} (req {:#x})",
                effective_level, OVERLAY_LEVEL, effective_behavior, behavior
            );
        }
    }
}
