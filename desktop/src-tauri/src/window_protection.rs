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
pub fn harden_always_on_top<R: Runtime>(window: &WebviewWindow<R>) {
    let _ = window.set_always_on_top(true);
    let _ = window.set_visible_on_all_workspaces(true);

    #[cfg(target_os = "macos")]
    macos::apply_window(window);
}

/// Call once at startup. Sets `NSApp.activationPolicy = Accessory` so our
/// windows can appear over other apps' fullscreen Spaces (the way Zoom PiP,
/// Rewind, and menu-bar apps do).
///
/// Side effect: our app no longer appears in the Dock or Cmd+Tab. Perfect
/// for a teleprompter — the presenter drives it via hotkey / mouse, not
/// via app switching.
pub fn set_accessory_app() {
    #[cfg(target_os = "macos")]
    macos::set_accessory_app();
}

#[cfg(target_os = "macos")]
mod macos {
    use cocoa::base::id;
    use objc::{class, msg_send, sel, sel_impl};
    use tauri::{Runtime, WebviewWindow};

    // NSPopUpMenuWindowLevel = 101 — the tier most macOS overlays use.
    const OVERLAY_LEVEL: i64 = 101;

    // NSWindowCollectionBehavior bits, sent as raw u64.
    const CAN_JOIN_ALL_SPACES: u64 = 1 << 0;
    const STATIONARY: u64 = 1 << 4;
    const IGNORES_CYCLE: u64 = 1 << 6;
    const FULL_SCREEN_AUXILIARY: u64 = 1 << 8;

    // NSApplicationActivationPolicy
    // 0 = Regular (dockable, default)
    // 1 = Accessory (no dock, no cmd-tab, can float over fullscreen)
    // 2 = Prohibited (no UI at all)
    const NS_APP_ACTIVATION_POLICY_ACCESSORY: i64 = 1;

    pub fn set_accessory_app() {
        unsafe {
            let ns_app: id = msg_send![class!(NSApplication), sharedApplication];
            if ns_app.is_null() {
                eprintln!("[optaprompter] NSApp shared instance is null");
                return;
            }
            let ok: bool =
                msg_send![ns_app, setActivationPolicy: NS_APP_ACTIVATION_POLICY_ACCESSORY];
            eprintln!(
                "[optaprompter] setActivationPolicy(Accessory) → {}",
                if ok { "ok" } else { "failed" }
            );
        }
    }

    pub fn apply_window<R: Runtime>(window: &WebviewWindow<R>) {
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
            let _: () = msg_send![ns_window, orderFrontRegardless];
        }
    }
}
